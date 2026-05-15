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

/** Ensure a timestamp string is parsed as UTC (backend stores UTC without Z suffix). */
function parseUTC(dateStr: string): Date {
  const s = dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z";
  return new Date(s);
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = parseUTC(dateStr).getTime();
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
  return parseUTC(dateStr).toLocaleDateString();
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


  const timeline = (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      <p className="text-xs text-faint">
        Save and restore tree snapshots locally. Versions are stored in the app database.
      </p>
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
      </div>

      {/* Version history — compact timeline */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-faint mb-2">Version History</p>
        {isLoading ? (
          <p className="text-xs text-faint">Loading...</p>
        ) : snapshots.length === 0 ? (
          <div className="bg-canvas border border-dashed rounded-md p-3 text-center text-xs text-faint">
            No versions saved yet. Commit your first version above.
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-line" />

            <div className="space-y-0">
              {/* Current state */}
              <div className="flex items-center gap-3 relative py-1.5">
                <div className="w-[14px] h-[14px] rounded-full bg-[#0d9488] border-2 border-white shadow-sm z-10 shrink-0" />
                <span className="text-xs font-medium text-[#0b7a70]">Current state</span>
                <span className="text-[10px] text-faint ml-auto">now</span>
              </div>

              {/* Snapshot rows */}
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className={`flex items-center gap-2 relative py-1.5 border-b border-line last:border-0 cursor-pointer rounded transition-colors ${
                    selectedSnapshotId === snap.id
                      ? "bg-[#e6f4f3] border-[#0d9488]/30"
                      : "hover:bg-canvas"
                  }`}
                  onClick={() => handleSnapshotClick(snap.id)}
                >
                  <div
                    className={`w-[14px] h-[14px] rounded-full border-2 z-10 shrink-0 ${
                      selectedSnapshotId === snap.id
                        ? "bg-[#0d9488] border-[#0d9488]/50"
                        : "bg-paper border-line"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium truncate min-w-0 ${
                      selectedSnapshotId === snap.id ? "text-[#0b7a70]" : "text-ink"
                    }`}
                    style={{ maxWidth: selectedSnapshotId ? "120px" : "200px" }}
                    title={snap.message}
                  >
                    {snap.message}
                  </span>
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
                      className="text-[10px] h-5 px-1.5 text-[#0d9488] ml-auto shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmRestoreId(snap.id);
                      }}
                    >
                      Restore
                    </Button>
                  )}
                  <span
                    className="text-[10px] text-faint shrink-0 cursor-help"
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
