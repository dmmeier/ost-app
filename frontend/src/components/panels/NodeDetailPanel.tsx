"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTreeStore } from "@/stores/tree-store";
import { useDeleteNode } from "@/hooks/use-tree";
import { api, ApiError } from "@/lib/api-client";
import { TreeWithNodes, NodeAssumption, AssumptionStatus } from "@/lib/types";
import { NODE_COLORS, NODE_LABELS, getNodeLabel, getNodeColor } from "@/lib/colors";
import { STANDARD_NODE_TYPES } from "@/lib/types";
import { useBubbleDefaults } from "@/hooks/use-tree";
import { DEFAULT_BUBBLE_DEFAULTS } from "@/lib/colors";
import { Badge } from "@/components/ui/badge";

import { useCanEdit } from "@/hooks/use-permissions";
import { InlineEditableText } from "./detail/InlineEditableText";
import { DeleteConfirmInline } from "./detail/DeleteConfirmInline";
import { NodeTagsSection } from "./detail/NodeTagsSection";
import { AddChildForm } from "./detail/AddChildForm";
import { MiniTreeDiagram } from "./detail/MiniTreeDiagram";
import { RichTextEditor } from "@/components/ui/RichTextEditor";

// ── AssumptionCard ─────────────────────────────────────────
interface AssumptionCardProps {
  assumption: NodeAssumption;
  nodeId: string;
  treeId: string;
  nodeType: string;
  canEdit: boolean;
  index: number;
}

function AssumptionCard({ assumption, nodeId, treeId, nodeType, canEdit, index }: AssumptionCardProps) {
  const queryClient = useQueryClient();
  const [textDraft, setTextDraft] = useState(assumption.text);
  const [evidenceDraft, setEvidenceDraft] = useState(assumption.evidence);
  const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evidenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyTextRef = useRef(false);
  const dirtyEvidenceRef = useRef(false);

  // Sync drafts when server data changes (unless user is actively editing)
  useEffect(() => {
    if (!dirtyTextRef.current) setTextDraft(assumption.text);
    if (!dirtyEvidenceRef.current) setEvidenceDraft(assumption.evidence);
  }, [assumption.text, assumption.evidence]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (textTimerRef.current) clearTimeout(textTimerRef.current);
      if (evidenceTimerRef.current) clearTimeout(evidenceTimerRef.current);
    };
  }, []);

  const saveField = useCallback(
    async (field: "text" | "evidence", value: string) => {
      try {
        await api.assumptions.update(nodeId, assumption.id, { [field]: value });
        if (field === "text") dirtyTextRef.current = false;
        else dirtyEvidenceRef.current = false;
        queryClient.invalidateQueries({ queryKey: ["tree", treeId] });
      } catch (err) {
        console.error(`Failed to save assumption ${field}:`, err);
      }
    },
    [nodeId, assumption.id, treeId, queryClient]
  );

  const handleTextChange = useCallback(
    (value: string) => {
      dirtyTextRef.current = true;
      setTextDraft(value);
      if (textTimerRef.current) clearTimeout(textTimerRef.current);
      textTimerRef.current = setTimeout(() => saveField("text", value), 800);
    },
    [saveField]
  );

  const handleEvidenceChange = useCallback(
    (value: string) => {
      dirtyEvidenceRef.current = true;
      setEvidenceDraft(value);
      if (evidenceTimerRef.current) clearTimeout(evidenceTimerRef.current);
      evidenceTimerRef.current = setTimeout(() => saveField("evidence", value), 800);
    },
    [saveField]
  );

  const cycleStatus = async () => {
    const next: Record<AssumptionStatus, AssumptionStatus> = {
      untested: "confirmed",
      confirmed: "rejected",
      rejected: "untested",
    };
    const newStatus = next[assumption.status] || "confirmed";
    try {
      await api.assumptions.update(nodeId, assumption.id, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ["tree", treeId] });
    } catch (err) {
      console.error("Failed to cycle status:", err);
    }
  };

  const handleDelete = async () => {
    try {
      await api.assumptions.delete(nodeId, assumption.id);
      queryClient.invalidateQueries({ queryKey: ["tree", treeId] });
    } catch (err) {
      console.error("Failed to delete assumption:", err);
    }
  };

  const status = assumption.status || "untested";
  const isRejected = status === "rejected";
  const isConfirmed = status === "confirmed";

  const statusIcon = isConfirmed ? (
    // Green checkmark
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-500"><path d="M20 6 9 17l-5-5"/></svg>
  ) : isRejected ? (
    // Red X
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
  ) : null;

  const statusLabel = isConfirmed ? "Confirmed" : isRejected ? "Rejected" : `#${index + 1}`;
  const statusColor = isConfirmed ? "text-green-600" : isRejected ? "text-red-400" : "text-gray-400";
  const statusTitle = isConfirmed
    ? "Click to reject"
    : isRejected
      ? "Click to reset to untested"
      : "Click to confirm";

  return (
    <div
      className={`border rounded-lg p-2.5 transition-all ${
        isRejected
          ? "border-red-200 bg-red-50/40 opacity-60"
          : isConfirmed
            ? "border-green-200 bg-green-50/30"
            : "border-gray-200 bg-white"
      }`}
    >
      {/* Card header: status toggle + index + delete */}
      <div className="flex items-center gap-2 mb-1.5">
        {canEdit ? (
          <button
            onClick={cycleStatus}
            className={`flex items-center gap-1.5 cursor-pointer group`}
            title={statusTitle}
          >
            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
              isConfirmed
                ? "border-green-400 bg-green-50"
                : isRejected
                  ? "border-red-400 bg-red-50"
                  : "border-gray-300 bg-white group-hover:border-gray-400"
            }`}>
              {statusIcon}
            </span>
            <span className={`text-[10px] uppercase font-semibold ${statusColor}`}>
              {statusLabel}
            </span>
          </button>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
              isConfirmed
                ? "border-green-400 bg-green-50"
                : isRejected
                  ? "border-red-400 bg-red-50"
                  : "border-gray-300 bg-white"
            }`}>
              {statusIcon}
            </span>
            <span className={`text-[10px] uppercase font-semibold ${statusColor}`}>
              {statusLabel}
            </span>
          </span>
        )}
        <div className="flex-1" />
        {canEdit && (
          <button
            onClick={handleDelete}
            className="text-gray-300 hover:text-red-500 transition-colors"
            title="Delete assumption"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        )}
      </div>

      {/* Text + Evidence in 2-column grid */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5 block">
            Assumption
          </label>
          <RichTextEditor
            value={textDraft}
            onChange={handleTextChange}
            placeholder={
              nodeType === "opportunity" || nodeType === "child_opportunity"
                ? "What assumptions need to be tested?"
                : nodeType === "solution"
                  ? "Why will this solve the problem?"
                  : nodeType === "experiment"
                    ? "Which assumptions are we testing?"
                    : "Assumption text..."
            }
            minRows={2}
            disabled={!canEdit || isRejected}
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5 block">
            Evidence
          </label>
          <RichTextEditor
            value={evidenceDraft}
            onChange={handleEvidenceChange}
            placeholder="Supporting data, observations, research..."
            minRows={2}
            disabled={!canEdit || isRejected}
          />
        </div>
      </div>
    </div>
  );
}

// ── NodeDetailPanel ────────────────────────────────────────
interface NodeDetailPanelProps {
  tree: TreeWithNodes;
}

export function NodeDetailPanel({ tree }: NodeDetailPanelProps) {
  const queryClient = useQueryClient();
  const { selectedNodeId, setSelectedNodeId, setChatInitialMessage, setCenterOnNodeId } = useTreeStore();
  const setConflictWarning = useTreeStore((s) => s.setConflictWarning);
  const deleteNode = useDeleteNode(tree.id);
  const canEdit = useCanEdit();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { data: bubbleDefaults } = useBubbleDefaults(tree.project_id);

  const selectedNode = tree.nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <div className="p-3 text-center text-gray-500">
        <p className="text-sm">Click a node to see its details</p>
      </div>
    );
  }

  const effectiveDefaults = bubbleDefaults ?? DEFAULT_BUBBLE_DEFAULTS;
  const colors = getNodeColor(selectedNode.node_type, effectiveDefaults);
  const children = tree.nodes.filter((n) => n.parent_id === selectedNode.id);
  const parent = tree.nodes.find((n) => n.id === selectedNode.parent_id) ?? null;

  // Any type can be a child of any other type
  const customTypeKeys = Object.keys(effectiveDefaults).filter(
    (k) => !(STANDARD_NODE_TYPES as readonly string[]).includes(k)
  );
  const validChildTypes = [...STANDARD_NODE_TYPES, ...customTypeKeys];

  const descendantCount = (() => {
    const descendants = new Set<string>();
    const queue = [...children.map((c) => c.id)];
    while (queue.length > 0) {
      const id = queue.shift()!;
      descendants.add(id);
      for (const n of tree.nodes) {
        if (n.parent_id === id) queue.push(n.id);
      }
    }
    return descendants.size;
  })();

  const handleDelete = () => {
    deleteNode.mutate(selectedNode.id, {
      onSuccess: () => {
        setSelectedNodeId(null);
        setConfirmingDelete(false);
      },
    });
  };

  const handleChatAboutNode = () => {
    const summary = `I want to discuss this ${getNodeLabel(selectedNode.node_type, effectiveDefaults)} node: "${selectedNode.title}"` +
      (selectedNode.description ? `. Description: ${selectedNode.description}` : "") +
      `. It has ${children.length} child${children.length !== 1 ? "ren" : ""}.`;
    setChatInitialMessage(summary);
  };

  const handleAddAssumption = async () => {
    try {
      await api.assumptions.create(selectedNode.id, {});
      queryClient.invalidateQueries({ queryKey: ["tree", tree.id] });
    } catch (err) {
      console.error("Failed to add assumption:", err);
    }
  };

  // Assumption stats
  const assumptions = selectedNode.assumptions || [];
  const confirmedCount = assumptions.filter((a) => a.status === "confirmed").length;
  const rejectedCount = assumptions.filter((a) => a.status === "rejected").length;
  const untestedCount = assumptions.filter((a) => a.status === "untested" || !a.status).length;

  return (
    <div className="p-3 overflow-y-auto h-full space-y-2">
      {/* Delete confirmation */}
      {confirmingDelete && (
        <DeleteConfirmInline
          node={selectedNode}
          childCount={descendantCount}
          onDelete={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {/* 2-column grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* LEFT COLUMN: title, description + tags, then assumptions */}
        <div className="space-y-3 min-w-0">
          {/* Badge + title + actions */}
          <div className="flex items-start gap-2">
            <Badge className={`${colors.bg} text-white text-xs shrink-0 mt-1`}>
              {getNodeLabel(selectedNode.node_type, effectiveDefaults)}
            </Badge>
            <InlineEditableText
              value={selectedNode.title}
              onSave={async (newTitle) => {
                try {
                  await api.nodes.update(selectedNode.id, { title: newTitle, version: selectedNode.version });
                  queryClient.invalidateQueries({ queryKey: ["tree", tree.id] });
                } catch (err) {
                  if (err instanceof ApiError && err.status === 409) {
                    setConflictWarning("This node was modified by someone else. Please refresh and try again.");
                    queryClient.invalidateQueries({ queryKey: ["tree", tree.id] });
                  }
                  throw err;
                }
              }}
              className="text-lg font-semibold flex-1 min-w-0 break-words"
              disabled={!canEdit}
            />
            <button
              onClick={handleChatAboutNode}
              className="text-gray-400 hover:text-teal-600 shrink-0 mt-1"
              title="Chat about this node"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
            <button
              onClick={() => setConfirmingDelete(true)}
              className={`shrink-0 mt-1 ${canEdit ? "text-gray-400 hover:text-red-500" : "text-gray-200 cursor-not-allowed"}`}
              title={canEdit ? "Delete node" : "View only"}
              disabled={!canEdit}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </div>
          {/* Description + Tags side-by-side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-gray-200 rounded-lg p-2.5">
              <p className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5">Description</p>
              <InlineEditableText
                value={selectedNode.description || ""}
                onSave={async (newDesc) => {
                  try {
                    await api.nodes.update(selectedNode.id, { description: newDesc, version: selectedNode.version });
                    queryClient.invalidateQueries({ queryKey: ["tree", tree.id] });
                  } catch (err) {
                    if (err instanceof ApiError && err.status === 409) {
                      setConflictWarning("This node was modified by someone else. Please refresh and try again.");
                      queryClient.invalidateQueries({ queryKey: ["tree", tree.id] });
                    }
                    throw err;
                  }
                }}
                className="text-sm text-gray-600"
                multiline
                richText
                placeholder="Add a description..."
                disabled={!canEdit}
              />
            </div>
            <div className="border border-gray-200 rounded-lg p-2.5">
              <NodeTagsSection
                nodeId={selectedNode.id}
                nodeTags={selectedNode.tags || []}
                tree={tree}
              />
            </div>
          </div>

          {/* Assumptions section */}
          <div className="border border-gray-200 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Assumptions
                {assumptions.length > 0 && (
                  <span className="ml-1 normal-case font-normal">
                    ({confirmedCount > 0 ? `${confirmedCount} confirmed` : ""}{confirmedCount > 0 && (untestedCount > 0 || rejectedCount > 0) ? ", " : ""}{untestedCount > 0 ? `${untestedCount} untested` : ""}{untestedCount > 0 && rejectedCount > 0 ? ", " : ""}{rejectedCount > 0 ? `${rejectedCount} rejected` : ""})
                  </span>
                )}
              </p>
              {canEdit && (
                <button
                  onClick={handleAddAssumption}
                  className="text-xs text-teal-600 hover:text-teal-800 font-medium flex items-center gap-0.5"
                  title="Add a new assumption"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                  Add
                </button>
              )}
            </div>
            {assumptions.length === 0 ? (
              <p className="text-xs text-gray-400 italic">
                No assumptions yet.{canEdit ? " Click + Add to create one." : ""}
              </p>
            ) : (
              <div className="space-y-2">
                {assumptions.map((a, i) => (
                  <AssumptionCard
                    key={a.id}
                    assumption={a}
                    nodeId={selectedNode.id}
                    treeId={tree.id}
                    nodeType={selectedNode.node_type}
                    canEdit={canEdit}
                    index={i}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: mini tree diagram, then add child */}
        <div className="space-y-3 min-w-0">
          <div className="border border-gray-200 rounded-lg p-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
              Focus View
            </p>
            <MiniTreeDiagram
              parent={parent}
              selected={selectedNode}
              children={children}
              onNavigate={(id) => { setSelectedNodeId(id); setCenterOnNodeId(id); }}
              bubbleDefaults={effectiveDefaults}
            />
          </div>

          {canEdit && validChildTypes.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-2.5">
              <AddChildForm
                selectedNodeId={selectedNode.id}
                treeId={tree.id}
                validChildTypes={validChildTypes}
                bubbleDefaults={effectiveDefaults}
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer metadata */}
      <div className="pt-1">
        <p className="text-xs text-gray-400">
          ID: {selectedNode.id.slice(0, 8)}... &mdash; {new Date(selectedNode.created_at).toLocaleDateString()}
          {selectedNode.last_modified_by_name && (
            <> &mdash; Last edited by {selectedNode.last_modified_by_name}</>
          )}
        </p>
      </div>
    </div>
  );
}
