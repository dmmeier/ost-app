"use client";

import { memo, useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { NodeType, BubbleDefaults, FillStyle, NodeAssumption } from "@/lib/types";
import { useTreeStore } from "@/stores/tree-store";
import { DEFAULT_BUBBLE_DEFAULTS, getNodeLabel } from "@/lib/colors";
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
  expanded?: boolean;
  assumptions?: NodeAssumption[];
  nodeDescription?: string;
  [key: string]: unknown;
}

// ── Read-only assumption card for expanded view ──────────────
function ExpandedAssumptionCard({ assumption, index, fontLight }: { assumption: NodeAssumption; index: number; fontLight?: boolean }) {
  const status = assumption.status || "untested";
  const isRejected = status === "rejected";
  const isConfirmed = status === "confirmed";

  const textHtml = useMemo(() => markdownToHtml(assumption.text || ""), [assumption.text]);
  const evidenceHtml = useMemo(() => markdownToHtml(assumption.evidence || ""), [assumption.evidence]);

  const statusIcon = isConfirmed ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={fontLight ? "text-green-300" : "text-green-500"}><path d="M20 6 9 17l-5-5"/></svg>
  ) : isRejected ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={fontLight ? "text-red-300" : "text-red-500"}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
  ) : null;

  const statusLabel = isConfirmed ? "Confirmed" : isRejected ? "Rejected" : `#${index + 1}`;

  return (
    <div
      className={`rounded px-2 py-1.5 text-[10px] ${isRejected ? "opacity-60" : ""}`}
      style={{
        backgroundColor: fontLight ? "rgba(255,255,255,0.12)" : "var(--ost-canvas)",
        border: `1px solid ${fontLight ? "rgba(255,255,255,0.18)" : "var(--ost-line)"}`,
      }}
    >
      {/* Status header */}
      <div className="flex items-center gap-1 mb-1">
        <span
          className="w-3 h-3 rounded border flex items-center justify-center shrink-0"
          style={{
            borderColor: fontLight ? "rgba(255,255,255,0.3)" : "var(--ost-line)",
            backgroundColor: fontLight ? "rgba(255,255,255,0.08)" : "var(--ost-paper)",
          }}
        >
          {statusIcon}
        </span>
        <span className={`uppercase font-medium font-mono tracking-[0.16em] text-[10px] ${
          fontLight
            ? (isConfirmed ? "text-green-300" : isRejected ? "text-red-300" : "text-white/50")
            : (isConfirmed ? "text-green-600" : isRejected ? "text-red-400" : "text-faint")
        }`}>
          {statusLabel}
        </span>
      </div>
      {/* Assumption + Evidence side by side */}
      <div className="grid grid-cols-2 gap-1.5">
        {(assumption.text || "").trim() ? (
          <div>
            <div className={`text-[10px] uppercase font-medium font-mono tracking-[0.16em] mb-0.5 ${fontLight ? "text-white/40" : "text-faint"}`}>Assumption</div>
            <div
              className={`text-[10px] leading-tight rich-text-display ${fontLight ? "text-white/90" : ""}`}
              style={fontLight ? undefined : { color: 'var(--ost-ink)' }}
              dangerouslySetInnerHTML={{ __html: textHtml }}
            />
          </div>
        ) : (
          <div className={`text-[10px] italic ${fontLight ? "text-white/40" : "text-faint"}`}>No assumption text</div>
        )}
        {(assumption.evidence || "").trim() ? (
          <div>
            <div className={`text-[10px] uppercase font-medium font-mono tracking-[0.16em] mb-0.5 ${fontLight ? "text-white/40" : "text-faint"}`}>Evidence</div>
            <div
              className={`text-[10px] leading-tight rich-text-display ${fontLight ? "text-white/90" : ""}`}
              style={fontLight ? undefined : { color: 'var(--ost-ink)' }}
              dangerouslySetInnerHTML={{ __html: evidenceHtml }}
            />
          </div>
        ) : (
          <div className={`text-[10px] italic ${fontLight ? "text-white/40" : "text-faint"}`}>No evidence</div>
        )}
      </div>
    </div>
  );
}

// ── Main OSTNode component ───────────────────────────────────
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
      const timers = [
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 50),
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 350),
      ];
      return () => timers.forEach(clearTimeout);
    }
  }, [nodeData.isEditing]);

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

  // Styling
  const bubbleDefaults = nodeData.bubbleDefaults ?? DEFAULT_BUBBLE_DEFAULTS;
  const typeDefaults = bubbleDefaults[nodeData.nodeType] ?? DEFAULT_BUBBLE_DEFAULTS[nodeData.nodeType] ?? { border_color: "#7a6f5b", border_width: 2 };
  const borderColor = nodeData.overrideBorderColor ?? typeDefaults.border_color;
  const borderWidth = nodeData.overrideBorderWidth ?? typeDefaults.border_width;
  const fillColor = nodeData.overrideFillColor ?? nodeData.tagFillColor ?? null;
  const fillStyle = nodeData.overrideFillStyle ?? (nodeData.tagFillStyle as FillStyle) ?? "none";
  const fillStyles = getFillStyle(fillColor, fillStyle);
  const hasFill = fillColor !== null && fillStyle !== "none";
  const fontLight = hasFill && (nodeData.fontLight ?? false);

  const descriptionHtml = useMemo(
    () => markdownToHtml(nodeData.expanded ? (nodeData.nodeDescription || "") : (nodeData.description || "")),
    [nodeData.description, nodeData.nodeDescription, nodeData.expanded]
  );

  const isExpanded = nodeData.expanded === true;
  const assumptions = (nodeData.assumptions || []) as NodeAssumption[];
  const nodeTypeLabel = getNodeLabel(nodeData.nodeType, bubbleDefaults);

  // ── Collapse/expand buttons (shared) ───
  const collapseButton = (nodeData.childCount ?? 0) > 0 ? (() => {
    const depthHides = nodeData.depthHidesChildren;
    const expandedBeyond = nodeData.isExpandedBeyondDepth;

    if (depthHides && !expandedBeyond) {
      return (
        <button
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 border border-teal rounded-full w-6 h-6 flex items-center justify-center text-xs text-teal hover:bg-teal-tint shadow-sm z-10" style={{ backgroundColor: 'var(--ost-paper)' }}
          onClick={(e) => { e.stopPropagation(); toggleExpandBeyondDepth(id); }}
          title="Expand subtree beyond level"
        >
          +{nodeData.childCount}
        </button>
      );
    }
    if (depthHides && expandedBeyond) {
      return (
        <button
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 border border-teal rounded-full w-6 h-6 flex items-center justify-center text-xs text-teal hover:bg-teal-tint shadow-sm z-10" style={{ backgroundColor: 'var(--ost-paper)' }}
          onClick={(e) => { e.stopPropagation(); toggleExpandBeyondDepth(id); }}
          title="Collapse subtree back to level"
        >
          −
        </button>
      );
    }
    return (
      <button
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-sm z-10" style={{ backgroundColor: 'var(--ost-paper)', border: '1px solid var(--ost-line)', color: 'var(--ost-muted)' }}
        onClick={(e) => { e.stopPropagation(); toggleCollapse(id); }}
        title={nodeData.isCollapsed ? "Expand children" : "Collapse children"}
      >
        {nodeData.isCollapsed ? `+${nodeData.childCount}` : "−"}
      </button>
    );
  })() : null;

  // ── EXPANDED VIEW ──────────────────────────────────────────
  if (isExpanded) {
    // Count assumptions by status
    const filledAssumptions = assumptions.filter(a => (a.text || "").trim() || (a.evidence || "").trim());
    const confirmed = filledAssumptions.filter(a => a.status === "confirmed").length;
    const rejected = filledAssumptions.filter(a => a.status === "rejected").length;
    const untested = filledAssumptions.length - confirmed - rejected;

    return (
      <div
        className={`relative rounded-lg shadow-sm ${
          nodeData.isSelected ? "ring-2 ring-offset-2" : ""
        } ${nodeData.isAncestorOnly ? "opacity-50" : ""}`}
        style={{
          borderColor,
          borderWidth: `${borderWidth}px`,
          borderStyle: "solid",
          backgroundColor: 'var(--ost-paper)',
          ...fillStyles,
          ...(nodeData.isSelected ? { ringColor: borderColor } : {}),
          width: 460,
          overflow: "hidden",
          wordWrap: "break-word" as const,
        }}
      >
        <Handle type="target" position={Position.Top} className="!bg-ost-muted" />

        {/* Index badge (top-right, like normal view) */}
        {nodeData.index != null && (
          <span className={`absolute top-1.5 right-2 text-[10px] rounded px-1 min-w-[18px] text-center ${fontLight ? "text-white/50 bg-white/10" : ""}`} style={fontLight ? undefined : { color: 'var(--ost-muted)', background: 'var(--ost-chip)' }}>
            #{nodeData.index}
          </span>
        )}

        {/* Header: type badge + status */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <span
            className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded text-white"
            style={{ backgroundColor: borderColor }}
          >
            {nodeTypeLabel}
          </span>
          {nodeData.status && nodeData.status !== "active" && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${fontLight ? "bg-white/15 text-white/80" : ""}`} style={fontLight ? undefined : { background: 'var(--ost-chip)', color: 'var(--ost-muted)' }}>
              {nodeData.status}
            </span>
          )}
        </div>

        {/* Title */}
        <div className="px-4 pb-1">
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
              className={`text-[18px] font-semibold leading-snug w-full bg-transparent border-b border-dashed outline-none ${fontLight ? "text-white border-white/40" : ""}`}
              style={fontLight ? undefined : { color: 'var(--ost-ink)', borderColor: 'var(--ost-muted)' }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className={`text-[18px] font-semibold leading-snug ${fontLight ? "text-white" : ""}`} style={fontLight ? undefined : { color: 'var(--ost-ink)' }}>
              {nodeData.title}
            </div>
          )}
        </div>

        {/* Divider */}
        {(descriptionHtml?.trim() || (nodeData.tags && nodeData.tags.length > 0) || filledAssumptions.length > 0) && (
          <div className="mx-4 mb-2 border-t" style={{ borderColor: fontLight ? 'rgba(255,255,255,0.2)' : 'var(--ost-line)' }} />
        )}

        {/* Description (full, no line-clamp) */}
        {descriptionHtml && descriptionHtml.trim() && (
          <div className="px-4 pb-2">
            <div className={`text-[10px] uppercase font-medium font-mono tracking-[0.16em] mb-0.5 ${fontLight ? "text-white/40" : "text-faint"}`}>Description</div>
            <div
              className={`text-[11px] leading-relaxed rich-text-display break-words ${fontLight ? "text-white/80" : ""}`}
              style={fontLight ? undefined : { color: 'var(--ost-ink)' }}
              dangerouslySetInnerHTML={{ __html: descriptionHtml }}
            />
          </div>
        )}

        {/* Tags (all shown) */}
        {nodeData.tags && nodeData.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 px-4 pb-2">
            {nodeData.tags.map((tag) => {
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
          </div>
        )}

        {/* Assumptions section */}
        {filledAssumptions.length > 0 && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`text-[10px] uppercase font-medium font-mono tracking-[0.16em] ${fontLight ? "text-white/40" : "text-faint"}`}>Assumptions</span>
              {confirmed > 0 && (
                <span className={`text-[9px] ${fontLight ? "text-green-300" : "text-green-600"}`}>{confirmed} &#10003;</span>
              )}
              {untested > 0 && (
                <span className={`text-[9px] ${fontLight ? "text-blue-300" : "text-blue-500"}`}>{untested} untested</span>
              )}
              {rejected > 0 && (
                <span className={`text-[9px] ${fontLight ? "text-red-300" : "text-red-400"}`}>{rejected} &#10007;</span>
              )}
            </div>
            <div className="space-y-1.5">
              {filledAssumptions.map((a, i) => (
                <ExpandedAssumptionCard key={a.id} assumption={a} index={i} fontLight={fontLight} />
              ))}
            </div>
          </div>
        )}

        <Handle type="source" position={Position.Bottom} className="!bg-ost-muted" />
        {collapseButton}
      </div>
    );
  }

  // ── NORMAL (compact) VIEW ──────────────────────────────────
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
      <Handle type="target" position={Position.Top} className="!bg-ost-muted" />
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
      <Handle type="source" position={Position.Bottom} className="!bg-ost-muted" />
      {collapseButton}
    </div>
  );
}

export const OSTNode = memo(OSTNodeComponent);
