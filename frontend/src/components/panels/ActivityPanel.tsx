"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { TreeWithNodes, ActivityLog } from "@/lib/types";
import { useTreeStore } from "@/stores/tree-store";
import { useAuthStore } from "@/stores/auth-store";

interface ActivityPanelProps {
  tree: TreeWithNodes;
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

function ActionIcon({ action }: { action: string }) {
  const base = "w-4 h-4 shrink-0";

  if (action === "node_created") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={base}>
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    );
  }
  if (action === "node_updated") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={base}>
        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    );
  }
  if (action === "node_deleted") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={base}>
        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    );
  }
  if (action === "node_moved") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={base}>
        <polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" /><polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" />
      </svg>
    );
  }
  if (action === "node_reordered") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={base}>
        <polyline points="7 15 12 20 17 15" /><polyline points="17 9 12 4 7 9" />
      </svg>
    );
  }
  if (action === "tag_added" || action === "tag_removed") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={base}>
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    );
  }
  if (action === "snapshot_created" || action === "snapshot_restored") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={base}>
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
      </svg>
    );
  }
  if (action === "git_committed") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={base}>
        <circle cx="12" cy="12" r="4" /><line x1="1.05" y1="12" x2="7" y2="12" /><line x1="17.01" y1="12" x2="22.96" y2="12" />
      </svg>
    );
  }
  // tree_created, tree_updated, tree_deleted, or unknown
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={base}>
      <circle cx="12" cy="12" r="10" />
    </svg>
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
      <div className="p-4 text-xs text-gray-400">Loading activity...</div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <p className="text-xs text-gray-400">Recent changes in this tree, newest first.</p>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400">
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
        <p className="text-xs text-gray-400">Recent changes in this tree, newest first.</p>
        {isAuthenticated && user && (
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-md p-0.5">
            <button
              onClick={() => setFilter("all")}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                filter === "all"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("mine")}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                filter === "mine"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Mine
            </button>
          </div>
        )}
      </div>
      {filteredEntries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center px-4">
            <p className="text-sm">No changes by you yet</p>
            <p className="text-xs mt-1">Your edits will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
          {filteredEntries.map((entry) => {
            const clickable = isClickable(entry);
            return (
              <div
                key={entry.id}
                onClick={() => handleClick(entry)}
                className={`flex items-center gap-2 py-1.5 px-2 rounded text-xs transition-colors ${
                  clickable
                    ? "cursor-pointer hover:bg-gray-50"
                    : ""
                }`}
              >
                <ActionIcon action={entry.action} />
                <span className="text-gray-700 min-w-0 truncate flex-1" title={entry.summary}>
                  <span className="font-medium text-gray-900">
                    {entry.user_display_name || "Someone"}
                  </span>{" "}
                  {entry.summary}
                </span>
                <span
                  className="text-[10px] text-gray-400 shrink-0 cursor-help"
                  title={absoluteTime(entry.created_at)}
                >
                  {relativeTime(entry.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
