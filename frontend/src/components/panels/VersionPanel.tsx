"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { TreeSnapshot, TreeWithNodes } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SnapshotDiffViewer } from "./SnapshotDiffViewer";

interface VersionPanelProps {
  tree: TreeWithNodes;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  const remainMin = diffMin % 60;
  if (diffHr < 24) return remainMin > 0 ? `${diffHr}h ${remainMin}m ago` : `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function absoluteTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function diffSummary(
  snap: TreeSnapshot,
  current: { nodeCount: number; edgeCount: number }
): string {
  const nodeDiff = current.nodeCount - snap.node_count;
  const edgeDiff = current.edgeCount - snap.edge_count;
  const parts: string[] = [];
  if (nodeDiff > 0) parts.push(`+${nodeDiff}n`);
  else if (nodeDiff < 0) parts.push(`${nodeDiff}n`);
  if (edgeDiff > 0) parts.push(`+${edgeDiff}e`);
  else if (edgeDiff < 0) parts.push(`${edgeDiff}e`);
  if (parts.length === 0) return "no changes";
  return parts.join(", ") + " since";
}

export function VersionPanel({ tree }: VersionPanelProps) {
  const queryClient = useQueryClient();
  const [snapshots, setSnapshots] = useState<TreeSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  const selectedIndex = snapshots.findIndex((s) => s.id === selectedSnapshotId);
  const selectedSnapshot = selectedIndex >= 0 ? snapshots[selectedIndex] : undefined;
  const previousSnapshot = selectedIndex >= 0 && selectedIndex < snapshots.length - 1
    ? snapshots[selectedIndex + 1]
    : null;

  const loadSnapshots = async () => {
    setIsLoading(true);
    try {
      const data = await api.snapshots.list(tree.id);
      setSnapshots(data);
    } catch (err) {
      console.error("Failed to load snapshots:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSnapshots();
    setSelectedSnapshotId(null);
  }, [tree.id]);

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setIsSaving(true);
    try {
      await api.snapshots.create(tree.id, commitMessage.trim());
      setCommitMessage("");
      loadSnapshots();
    } catch (err) {
      console.error("Failed to create snapshot:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestore = async (snapshotId: string) => {
    setIsRestoring(true);
    try {
      await api.snapshots.restore(tree.id, snapshotId);
      setConfirmRestoreId(null);
      setSelectedSnapshotId(null);
      queryClient.invalidateQueries({ queryKey: ["tree", tree.id] });
      loadSnapshots();
    } catch (err) {
      console.error("Failed to restore snapshot:", err);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSnapshotClick = (snapId: string) => {
    setSelectedSnapshotId((prev) => (prev === snapId ? null : snapId));
  };

  const currentState = { nodeCount: tree.nodes.length, edgeCount: tree.edges.length };

  const timeline = (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      {/* Compact commit bar */}
      <div>
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Describe this version..."
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCommit()}
            className="text-sm flex-1"
          />
          <Button
            size="sm"
            onClick={handleCommit}
            disabled={!commitMessage.trim() || isSaving}
            className="text-xs"
          >
            {isSaving ? "..." : "Commit"}
          </Button>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">
          Current: {tree.nodes.length} nodes, {tree.edges.length} edges
        </p>
      </div>

      {/* Version history — compact timeline */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Version History</p>
        {isLoading ? (
          <p className="text-xs text-gray-400">Loading...</p>
        ) : snapshots.length === 0 ? (
          <div className="bg-gray-50 border border-dashed rounded-md p-3 text-center text-xs text-gray-400">
            No versions saved yet. Commit your first version above.
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-200" />

            <div className="space-y-0">
              {/* Current state */}
              <div className="flex items-center gap-3 relative py-1.5">
                <div className="w-[14px] h-[14px] rounded-full bg-blue-500 border-2 border-white shadow-sm z-10 shrink-0" />
                <span className="text-xs font-medium text-blue-600">Current state</span>
                <span className="text-[10px] text-gray-400">
                  {tree.nodes.length}n, {tree.edges.length}e
                </span>
                <span className="text-[10px] text-gray-400 ml-auto">now</span>
              </div>

              {/* Snapshot rows */}
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className={`flex items-center gap-2 relative py-1.5 border-b border-gray-100 last:border-0 cursor-pointer rounded transition-colors ${
                    selectedSnapshotId === snap.id
                      ? "bg-blue-50 border-blue-200"
                      : "hover:bg-gray-50"
                  }`}
                  onClick={() => handleSnapshotClick(snap.id)}
                >
                  <div
                    className={`w-[14px] h-[14px] rounded-full border-2 z-10 shrink-0 ${
                      selectedSnapshotId === snap.id
                        ? "bg-blue-500 border-blue-300"
                        : "bg-white border-gray-300"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium truncate min-w-0 ${
                      selectedSnapshotId === snap.id ? "text-blue-700" : "text-gray-700"
                    }`}
                    style={{ maxWidth: selectedSnapshotId ? "120px" : "200px" }}
                    title={snap.message}
                  >
                    {snap.message}
                  </span>
                  <span className="text-[10px] text-gray-400 shrink-0">
                    {snap.node_count}n, {snap.edge_count}e
                  </span>
                  {!selectedSnapshotId && (
                    <span className="text-[10px] text-gray-400 italic shrink-0">
                      {diffSummary(snap, currentState)}
                    </span>
                  )}
                  {confirmRestoreId === snap.id ? (
                    <span
                      className="flex items-center gap-1 ml-auto shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[10px] text-amber-600">Restore?</span>
                      <Button
                        variant="default"
                        size="sm"
                        className="text-[10px] h-5 px-1.5"
                        disabled={isRestoring}
                        onClick={() => handleRestore(snap.id)}
                      >
                        {isRestoring ? "..." : "Yes"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-[10px] h-5 px-1.5"
                        onClick={() => setConfirmRestoreId(null)}
                      >
                        No
                      </Button>
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[10px] h-5 px-1.5 text-blue-600 ml-auto shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmRestoreId(snap.id);
                      }}
                    >
                      Restore
                    </Button>
                  )}
                  <span
                    className="text-[10px] text-gray-400 shrink-0 cursor-help"
                    title={absoluteTime(snap.created_at)}
                  >
                    {relativeTime(snap.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (selectedSnapshotId && selectedSnapshot) {
    return (
      <div className="flex h-full">
        <div className="w-[35%] border-r overflow-hidden">{timeline}</div>
        <div className="w-[65%] overflow-hidden">
          <SnapshotDiffViewer
            treeId={tree.id}
            snapshotId={selectedSnapshotId}
            snapshotMessage={selectedSnapshot.message}
            previousSnapshotId={previousSnapshot?.id ?? null}
            previousSnapshotMessage={previousSnapshot?.message ?? null}
            onClose={() => setSelectedSnapshotId(null)}
          />
        </div>
      </div>
    );
  }

  return timeline;
}
