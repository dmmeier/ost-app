"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { TreeWithNodes, ActivityLog } from "@/lib/types";
import { useTreeStore } from "@/stores/tree-store";
import { useAuthStore } from "@/stores/auth-store";
import {
  Plus, Pencil, Trash2, Move, ArrowUpDown,
  Tag, Camera, GitBranch, Circle,
} from "lucide-react";

/* ── Design tokens (matching HistoryPanel style) ──────── */
const A = {
  rail: "#e5e3dd",
  created:     { fg: "#16a34a", bg: "#dcfce7" },
  updated:     { fg: "#2563eb", bg: "#dbeafe" },
  deleted:     { fg: "#dc2626", bg: "#fee2e2" },
  moved:       { fg: "#9333ea", bg: "#f3e8ff" },
  reordered:   { fg: "#7a6f5b", bg: "#f0ede7" },
  tag:         { fg: "#0d9488", bg: "#ccfbf1" },
  snapshot:    { fg: "#d97706", bg: "#fef3c7" },
  git:         { fg: "#ea580c", bg: "#ffedd5" },
  fallback:    { fg: "#7a6f5b", bg: "#f0ede7" },
} as const;

interface ActivityPanelProps {
  tree: TreeWithNodes;
}

/** A group of consecutive entries with the same summary. */
interface CondensedEntry {
  /** The most recent entry in the group (displayed). */
  latest: ActivityLog;
  /** Total number of entries collapsed into this group. */
  count: number;
  /** The oldest entry's timestamp in the group (for time-range display). */
  oldestTimestamp: string;
}

/**
 * Condense consecutive activity entries that share the same summary text.
 * Returns groups ordered newest-first (same as input), where each group
 * contains only the most recent entry and a count of how many were collapsed.
 */
function condenseActivities(entries: ActivityLog[]): CondensedEntry[] {
  if (entries.length === 0) return [];

  const groups: CondensedEntry[] = [];
  let current: CondensedEntry = {
    latest: entries[0],
    count: 1,
    oldestTimestamp: entries[0].created_at,
  };

  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.summary === current.latest.summary) {
      current.count++;
      current.oldestTimestamp = entry.created_at; // entries are newest-first, so later = older
    } else {
      groups.push(current);
      current = {
        latest: entry,
        count: 1,
        oldestTimestamp: entry.created_at,
      };
    }
  }
  groups.push(current);
  return groups;
}

/** Ensure a timestamp string is parsed as UTC (backend stores UTC without Z suffix). */
function parseUTC(dateStr: string): Date {
  const s = dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z";
  return new Date(s);
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = parseUTC(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffHr < 48) return "yesterday";
  return parseUTC(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function absoluteTime(dateStr: string): string {
  return parseUTC(dateStr).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* ── 22px circular glyph markers (matching HistoryPanel) ── */
function actionColors(action: string): { fg: string; bg: string } {
  if (action === "node_created") return A.created;
  if (action === "node_updated") return A.updated;
  if (action === "node_deleted") return A.deleted;
  if (action === "node_moved") return A.moved;
  if (action === "node_reordered") return A.reordered;
  if (action === "tag_added" || action === "tag_removed") return A.tag;
  if (action === "snapshot_created" || action === "snapshot_restored") return A.snapshot;
  if (action === "git_committed") return A.git;
  return A.fallback;
}

function ActionGlyph({ action }: { action: string }) {
  const c = actionColors(action);

  const Icon = (() => {
    if (action === "node_created") return Plus;
    if (action === "node_updated") return Pencil;
    if (action === "node_deleted") return Trash2;
    if (action === "node_moved") return Move;
    if (action === "node_reordered") return ArrowUpDown;
    if (action === "tag_added" || action === "tag_removed") return Tag;
    if (action === "snapshot_created" || action === "snapshot_restored") return Camera;
    if (action === "git_committed") return GitBranch;
    return Circle;
  })();

  return (
    <span
      className="inline-flex items-center justify-center shrink-0"
      style={{
        width: 22, height: 22, borderRadius: 999,
        background: c.bg,
        border: `1.5px solid ${c.fg}`,
        position: "relative", zIndex: 1,
        boxSizing: "border-box",
      }}
    >
      <Icon size={11} color={c.fg} strokeWidth={2} />
    </span>
  );
}

export function ActivityPanel({ tree }: ActivityPanelProps) {
  const { setSelectedNodeId, setCenterOnNodeId } = useTreeStore();
  const { user, isAuthenticated } = useAuthStore();
  const [filter, setFilter] = useState<"all" | "mine">("all");

  const { data: entries, isLoading } = useQuery({
    queryKey: ["activity", tree.id, tree.version],
    queryFn: () => api.activity.forTree(tree.id, 50),
    refetchInterval: 10_000,
  });

  const nodeIds = new Set(tree.nodes.map((n) => n.id));

  const filteredEntries = entries
    ? filter === "mine" && user
      ? entries.filter((e) => e.user_id === user.id)
      : entries
    : [];

  const condensed = useMemo(
    () => condenseActivities(filteredEntries),
    [filteredEntries],
  );

  const handleClick = (entry: ActivityLog) => {
    if (entry.resource_type === "node" && entry.resource_id && nodeIds.has(entry.resource_id)) {
      setSelectedNodeId(entry.resource_id);
      setCenterOnNodeId(entry.resource_id);
    }
  };

  const isClickable = (entry: ActivityLog) =>
    entry.resource_type === "node" && entry.resource_id != null && nodeIds.has(entry.resource_id);

  if (isLoading) {
    return (
      <div className="p-4 text-xs text-faint">Loading activity...</div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Recent Changes</p>
        </div>
        <div className="flex-1 flex items-center justify-center text-faint">
          <div className="text-center px-4">
            <p className="text-sm">No activity yet</p>
            <p className="text-xs mt-1">Changes will appear here as you edit.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-1 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">Recent Changes</p>
        {isAuthenticated && user && (
          <div className="flex items-center gap-0.5 bg-chip rounded-md p-0.5">
            <button
              onClick={() => setFilter("all")}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                filter === "all"
                  ? "bg-paper text-ink shadow-sm"
                  : "text-ost-muted hover:text-ink"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("mine")}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                filter === "mine"
                  ? "bg-paper text-ink shadow-sm"
                  : "text-ost-muted hover:text-ink"
              }`}
            >
              Mine
            </button>
          </div>
        )}
      </div>
      {condensed.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-faint">
          <div className="text-center px-4">
            <p className="text-sm">No changes by you yet</p>
            <p className="text-xs mt-1">Your edits will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <ol style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
            {/* Vertical rail behind markers */}
            <div style={{ position: "absolute", left: 11, top: 14, bottom: 14, width: 1.5, background: A.rail }} />

            {condensed.map((group, idx) => {
              const entry = group.latest;
              const clickable = isClickable(entry);
              const isLast = idx === condensed.length - 1;
              const timeTitle =
                group.count > 1
                  ? `${group.count} changes: ${absoluteTime(entry.created_at)} – ${absoluteTime(group.oldestTimestamp)}`
                  : absoluteTime(entry.created_at);
              return (
                <li
                  key={entry.id}
                  onClick={() => handleClick(entry)}
                  className={`flex items-center gap-3 py-1.5 relative transition-colors rounded ${
                    isLast ? "" : "border-b border-line"
                  } ${
                    clickable ? "cursor-pointer hover:bg-chip" : ""
                  }`}
                >
                  <span className="relative z-10 bg-paper py-0.5 shrink-0">
                    <ActionGlyph action={entry.action} />
                  </span>
                  <span className="text-ink min-w-0 truncate flex-1 text-xs" title={entry.summary}>
                    <span className="font-medium text-ink">
                      {entry.user_display_name || "Someone"}
                    </span>{" "}
                    {entry.summary}
                  </span>
                  {group.count > 1 && (
                    <span
                      className="text-[10px] text-faint bg-chip rounded-full px-1.5 py-0.5 shrink-0"
                      title={`${group.count} identical changes condensed`}
                    >
                      ×{group.count}
                    </span>
                  )}
                  <span
                    className="text-[10px] text-faint shrink-0 cursor-help"
                    title={timeTitle}
                  >
                    {relativeTime(entry.created_at)}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
