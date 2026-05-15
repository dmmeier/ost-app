"use client";

import { memo, useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { NodeType, BubbleDefaults, FillStyle } from "@/lib/types";
import { useTreeStore } from "@/stores/tree-store";
import { DEFAULT_BUBBLE_DEFAULTS } from "@/lib/colors";
import { getFillStyle } from "@/lib/fill-patterns";
import { api } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { markdownToHtml } from "@/lib/markdown-to-html";

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
  assumptionCount?: number;
  confirmedAssumptionCount?: number;
  rejectedAssumptionCount?: number;
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
  isEditing?: boolean;
  [key: string]: unknown;
}

function OSTNodeComponent({ id, data }: NodeProps) {
  const nodeData = data as OSTNodeData;
  const toggleCollapse = useTreeStore((s) => s.toggleCollapse);
  const toggleExpandBeyondDepth = useTreeStore((s) => s.toggleExpandBeyondDepth);
  const setEditingNodeId = useTreeStore((s) => s.setEditingNodeId);
  const queryClient = useQueryClient();

  // Inline editing state
  const [editTitle, setEditTitle] = useState(nodeData.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (nodeData.isEditing && inputRef.current) {
      // Delay focus to avoid conflict with ReactFlow's setCenter animation
      // which steals focus when centering on the newly created node
      const timers = [
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 50),
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 350),
      ];
      return () => timers.forEach(clearTimeout);
    }
  }, [nodeData.isEditing]);

  // Sync draft when title changes externally
  useEffect(() => {
    if (!nodeData.isEditing) {
      setEditTitle(nodeData.title);
    }
  }, [nodeData.title, nodeData.isEditing]);

  const commitEdit = useCallback(async () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== nodeData.title) {
      try {
        await api.nodes.update(id, { title: trimmed });
        queryClient.invalidateQueries({ queryKey: ["tree"] });
      } catch (err) {
        console.error("Failed to update title:", err);
      }
    }
    setEditingNodeId(null);
  }, [editTitle, nodeData.title, id, queryClient, setEditingNodeId]);

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

  const descriptionHtml = useMemo(
    () => markdownToHtml(nodeData.description || ""),
    [nodeData.description]
  );

  return (
    <div
      className={`relative px-4 py-3 rounded-lg shadow-sm min-w-[200px] max-w-[280px] ${
        nodeData.isSelected ? "ring-1 ring-offset-1" : ""
      } ${nodeData.isAncestorOnly ? "opacity-50" : ""}`}
      style={{
        borderColor,
        borderWidth: `${borderWidth}px`,
        borderStyle: "solid",
        backgroundColor: 'var(--ost-paper)',
        ...fillStyles,
        ...(nodeData.isSelected ? { ringColor: borderColor } : {}),
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#7a6f5b]" />
      {nodeData.index != null && (
        <span className={`absolute top-1.5 right-2 text-[10px] rounded px-1 min-w-[18px] text-center ${fontLight ? "text-white/50 bg-white/10" : ""}`} style={fontLight ? undefined : { color: 'var(--ost-muted)', background: 'var(--ost-chip)' }}>
          #{nodeData.index}
        </span>
      )}
      {nodeData.isEditing ? (
        <input
          ref={inputRef}
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
            if (e.key === "Escape") { setEditTitle(nodeData.title); setEditingNodeId(null); }
          }}
          className={`text-[18px] font-semibold leading-snug pr-8 w-full bg-transparent border-b border-dashed outline-none ${fontLight ? "text-white border-white/40" : ""}`}
          style={fontLight ? undefined : { color: 'var(--ost-ink)', borderColor: 'var(--ost-muted)' }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className={`text-[18px] font-semibold leading-snug line-clamp-3 pr-8 ${fontLight ? "text-white" : ""}`} style={fontLight ? undefined : { color: 'var(--ost-ink)' }}>{nodeData.title}</div>
      )}
      {nodeData.status && nodeData.status !== "active" && (
        <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded ${fontLight ? "bg-white/15 text-white/80" : ""}`} style={fontLight ? undefined : { background: 'var(--ost-chip)', color: 'var(--ost-muted)' }}>
          {nodeData.status}
        </span>
      )}
      {nodeData.description && (
        <div
          className={`text-xs mt-1 line-clamp-2 rich-text-display ${fontLight ? "text-white/80" : ""}`}
          style={fontLight ? undefined : { color: 'var(--ost-muted)' }}
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      )}
      {/* Tag chips */}
      {nodeData.tags && nodeData.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {nodeData.tags.slice(0, 3).map((tag) => {
            const tagColor = nodeData.tagColorMap?.[tag];
            return (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded-full border"
                style={tagColor ? {
                  backgroundColor: tagColor + "20",
                  borderColor: tagColor,
                  color: tagColor,
                } : {
                  backgroundColor: 'var(--ost-chip)',
                  borderColor: 'var(--ost-line)',
                  color: 'var(--ost-muted)',
                }}
              >
                {tag}
              </span>
            );
          })}
          {nodeData.tags.length > 3 && (
            <span className="text-[10px] text-ost-muted">+{nodeData.tags.length - 3}</span>
          )}
        </div>
      )}
      {/* Assumption indicator */}
      {(nodeData.assumptionCount ?? 0) > 0 && (() => {
        const total = nodeData.assumptionCount ?? 0;
        const confirmed = nodeData.confirmedAssumptionCount ?? 0;
        const rejected = nodeData.rejectedAssumptionCount ?? 0;
        const untested = total - confirmed - rejected;
        const parts: string[] = [];
        if (confirmed > 0) parts.push(`${confirmed} confirmed`);
        if (untested > 0) parts.push(`${untested} untested`);
        if (rejected > 0) parts.push(`${rejected} rejected`);
        return (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {confirmed > 0 && (
              <span className={`text-[10px] ${fontLight ? "text-green-200" : "text-green-600"}`}>
                {confirmed} <span className="inline-block">&#10003;</span>
              </span>
            )}
            {untested > 0 && (
              <span className={`text-[10px] ${fontLight ? "text-blue-200" : "text-blue-500"}`}>
                {untested}
              </span>
            )}
            {rejected > 0 && (
              <span className={`text-[10px] ${fontLight ? "text-red-300" : "text-red-400"}`}>
                {rejected} <span className="inline-block">&#10007;</span>
              </span>
            )}
          </div>
        );
      })()}
      {/* Legacy single assumption indicator */}
      {(nodeData.assumptionCount ?? 0) === 0 && nodeData.hasAssumption && (
        <div className="flex items-center gap-1 mt-1.5">
          <span className={`text-[10px] ${fontLight ? "text-blue-200" : "text-blue-500"}`}>
            has assumption
          </span>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-[#7a6f5b]" />
      {(nodeData.childCount ?? 0) > 0 && (() => {
        // Determine button behavior based on whether depth filter hides children
        const depthHides = nodeData.depthHidesChildren;
        const expandedBeyond = nodeData.isExpandedBeyondDepth;

        if (depthHides && !expandedBeyond) {
          // Children hidden by global depth — show expand button
          return (
            <button
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 border border-[#0d9488] rounded-full w-6 h-6 flex items-center justify-center text-xs text-[#0d9488] hover:bg-[#e6f4f3] shadow-sm z-10" style={{ backgroundColor: 'var(--ost-paper)' }}
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
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 border border-[#0d9488] rounded-full w-6 h-6 flex items-center justify-center text-xs text-[#0d9488] hover:bg-[#e6f4f3] shadow-sm z-10" style={{ backgroundColor: 'var(--ost-paper)' }}
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
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-sm z-10" style={{ backgroundColor: 'var(--ost-paper)', border: '1px solid var(--ost-line)', color: 'var(--ost-muted)' }}
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
