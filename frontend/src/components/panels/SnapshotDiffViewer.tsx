"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import type { SnapshotDetail } from "@/lib/types";
import { computeSemanticDiff, SemanticChange } from "@/lib/snapshot-diff";
import { NODE_COLORS } from "@/lib/colors";
import { Button } from "@/components/ui/button";

interface SnapshotDiffViewerProps {
  treeId: string;
  snapshotId: string;
  snapshotMessage: string;
  previousSnapshotId: string | null;
  previousSnapshotMessage: string | null;
  onClose: () => void;
}

const EMPTY_TREE = { name: "", description: "", tree_context: "", nodes: [], edges: [] };

export function SnapshotDiffViewer({
  treeId,
  snapshotId,
  snapshotMessage,
  previousSnapshotId,
  previousSnapshotMessage,
  onClose,
}: SnapshotDiffViewerProps) {
  const [changes, setChanges] = useState<SemanticChange[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const baseLabel = previousSnapshotMessage || "empty tree";

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchThis = api.snapshots.get(treeId, snapshotId);
    const fetchPrev = previousSnapshotId
      ? api.snapshots.get(treeId, previousSnapshotId)
      : Promise.resolve(null);

    Promise.all([fetchThis, fetchPrev])
      .then(([thisSnap, prevSnap]) => {
        if (cancelled) return;
        const before = prevSnap ? prevSnap.snapshot_data : EMPTY_TREE;
        const after = thisSnap.snapshot_data;
        const diff = computeSemanticDiff(before, after);
        setChanges(diff);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Failed to load snapshot");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [treeId, snapshotId, previousSnapshotId]);

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-faint flex items-center gap-2">
        <span className="animate-spin">&#9696;</span> Loading diff...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
          Failed to load snapshot: {error}
        </div>
        <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  const addedCount = changes.filter((c) => c.kind === "added").length;
  const removedCount = changes.filter((c) => c.kind === "removed").length;
  const modifiedCount = changes.filter((c) => c.kind === "modified").length;

  const nodeChanges = changes.filter((c) => c.entityType === "node");
  const edgeChanges = changes.filter((c) => c.entityType === "edge");
  const treeChanges = changes.filter((c) => c.entityType === "tree");

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-canvas shrink-0">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-ink">
            &ldquo;{snapshotMessage}&rdquo; vs &ldquo;{baseLabel}&rdquo;
          </p>
          <Button variant="ghost" size="sm" className="text-xs h-5 px-1.5" onClick={onClose}>
            &times;
          </Button>
        </div>
        <div className="flex gap-2 mt-1">
          {addedCount > 0 && (
            <span className="text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
              +{addedCount} added
            </span>
          )}
          {removedCount > 0 && (
            <span className="text-[10px] font-medium text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
              -{removedCount} removed
            </span>
          )}
          {modifiedCount > 0 && (
            <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
              ~{modifiedCount} modified
            </span>
          )}
          {changes.length === 0 && (
            <span className="text-[10px] text-ost-muted">No changes</span>
          )}
        </div>
      </div>

      {/* Changes list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {changes.length === 0 && (
          <div className="bg-canvas border border-dashed rounded-md p-4 text-center text-faint">
            No changes in this version.
          </div>
        )}

        {nodeChanges.length > 0 && (
          <ChangeSection title="Nodes" changes={nodeChanges} />
        )}
        {edgeChanges.length > 0 && (
          <ChangeSection title="Edges" changes={edgeChanges} />
        )}
        {treeChanges.length > 0 && (
          <ChangeSection title="Tree Settings" changes={treeChanges} />
        )}
      </div>
    </div>
  );
}

function ChangeSection({ title, changes }: { title: string; changes: SemanticChange[] }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-faint mb-1.5">
        {title}
      </p>
      <div className="space-y-1">
        {changes.map((change, i) => (
          <ChangeRow key={`${change.entityId || "tree"}-${change.field || ""}-${i}`} change={change} />
        ))}
      </div>
    </div>
  );
}

function ChangeRow({ change }: { change: SemanticChange }) {
  const colors = change.nodeType ? NODE_COLORS[change.nodeType] : null;

  const kindStyles = {
    added: "border-l-emerald-300 bg-emerald-50/50",
    removed: "border-l-red-300 bg-red-50/50",
    modified: "border-l-amber-300 bg-amber-50/50",
  };

  const kindPrefix = {
    added: "+",
    removed: "\u2212",
    modified: "~",
  };

  return (
    <div className={`border-l-2 rounded-r px-2 py-1.5 ${kindStyles[change.kind]}`}>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] font-bold opacity-60">
          {kindPrefix[change.kind]}
        </span>
        {colors && <span className={`w-2 h-2 rounded-full ${colors.bg} inline-block`} />}
        <span className={`font-medium ${colors?.text || "text-ink"}`}>
          {change.title}
        </span>
        {change.nodeType && (
          <span className="text-[10px] text-faint">({change.nodeType.replace("_", " ")})</span>
        )}
      </div>
      {change.field && (
        <div className="ml-6 mt-0.5 text-[11px] text-ost-muted">
          <span className="font-medium">{change.field}:</span>{" "}
          <span className="line-through text-red-600/70">{change.oldValue}</span>
          {" \u2192 "}
          <span className="text-green-700">{change.newValue}</span>
        </div>
      )}
    </div>
  );
}
