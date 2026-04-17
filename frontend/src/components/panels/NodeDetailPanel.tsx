"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTreeStore } from "@/stores/tree-store";
import { useDeleteNode } from "@/hooks/use-tree";
import { api } from "@/lib/api-client";
import { TreeWithNodes } from "@/lib/types";
import { NODE_COLORS, NODE_LABELS, getNodeLabel, getNodeColor } from "@/lib/colors";
import { STANDARD_NODE_TYPES } from "@/lib/types";
import { useBubbleDefaults } from "@/hooks/use-tree";
import { DEFAULT_BUBBLE_DEFAULTS } from "@/lib/colors";
import { Badge } from "@/components/ui/badge";

import { InlineEditableText } from "./detail/InlineEditableText";
import { DeleteConfirmInline } from "./detail/DeleteConfirmInline";
import { NodeTagsSection } from "./detail/NodeTagsSection";
import { AddChildForm } from "./detail/AddChildForm";
import { MiniTreeDiagram } from "./detail/MiniTreeDiagram";

interface NodeDetailPanelProps {
  tree: TreeWithNodes;
}

export function NodeDetailPanel({ tree }: NodeDetailPanelProps) {
  const queryClient = useQueryClient();
  const { selectedNodeId, setSelectedNodeId, setChatInitialMessage, setCenterOnNodeId } = useTreeStore();
  const deleteNode = useDeleteNode(tree.id);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { data: bubbleDefaults } = useBubbleDefaults(tree.project_id);

  // Auto-save assumption/evidence with debounce
  const [assumptionDraft, setAssumptionDraft] = useState("");
  const [evidenceDraft, setEvidenceDraft] = useState("");
  const assumptionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evidenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedNode = tree.nodes.find((n) => n.id === selectedNodeId);

  // Sync draft state when selected node changes
  useEffect(() => {
    setAssumptionDraft(selectedNode?.assumption ?? "");
    setEvidenceDraft(selectedNode?.evidence ?? "");
  }, [selectedNodeId, selectedNode?.assumption, selectedNode?.evidence]);

  // Auto-save assumption
  const saveAssumption = useCallback(
    async (value: string) => {
      if (!selectedNode) return;
      try {
        await api.nodes.update(selectedNode.id, { assumption: value });
        queryClient.invalidateQueries({ queryKey: ["tree", tree.id] });
      } catch (err) {
        console.error("Failed to save assumption:", err);
      }
    },
    [selectedNode, tree.id, queryClient]
  );

  const handleAssumptionChange = useCallback(
    (value: string) => {
      setAssumptionDraft(value);
      if (assumptionTimerRef.current) clearTimeout(assumptionTimerRef.current);
      assumptionTimerRef.current = setTimeout(() => saveAssumption(value), 800);
    },
    [saveAssumption]
  );

  // Auto-save evidence
  const saveEvidence = useCallback(
    async (value: string) => {
      if (!selectedNode) return;
      try {
        await api.nodes.update(selectedNode.id, { evidence: value });
        queryClient.invalidateQueries({ queryKey: ["tree", tree.id] });
      } catch (err) {
        console.error("Failed to save evidence:", err);
      }
    },
    [selectedNode, tree.id, queryClient]
  );

  const handleEvidenceChange = useCallback(
    (value: string) => {
      setEvidenceDraft(value);
      if (evidenceTimerRef.current) clearTimeout(evidenceTimerRef.current);
      evidenceTimerRef.current = setTimeout(() => saveEvidence(value), 800);
    },
    [saveEvidence]
  );

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (assumptionTimerRef.current) clearTimeout(assumptionTimerRef.current);
      if (evidenceTimerRef.current) clearTimeout(evidenceTimerRef.current);
    };
  }, []);

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
        {/* LEFT COLUMN: title, description + tags, then assumption/evidence */}
        <div className="space-y-3 min-w-0">
          {/* Badge + title + actions */}
          <div className="flex items-start gap-2">
            <Badge className={`${colors.bg} text-white text-xs shrink-0 mt-1`}>
              {getNodeLabel(selectedNode.node_type, effectiveDefaults)}
            </Badge>
            <InlineEditableText
              value={selectedNode.title}
              onSave={async (newTitle) => {
                await api.nodes.update(selectedNode.id, { title: newTitle });
                queryClient.invalidateQueries({ queryKey: ["tree", tree.id] });
              }}
              className="text-lg font-semibold flex-1 min-w-0 break-words"
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
              className="text-gray-400 hover:text-red-500 shrink-0 mt-1"
              title="Delete node"
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
                  await api.nodes.update(selectedNode.id, { description: newDesc });
                  queryClient.invalidateQueries({ queryKey: ["tree", tree.id] });
                }}
                className="text-sm text-gray-600"
                multiline
                placeholder="Add a description..."
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

          {/* Assumption & Evidence (only for non-root nodes) */}
          {parent && (
            <div className="border border-gray-200 rounded-lg p-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                Assumption & Evidence
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5 block">
                    Assumption
                  </label>
                  <textarea
                    value={assumptionDraft}
                    onChange={(e) => handleAssumptionChange(e.target.value)}
                    placeholder={parent ? `Why does this matter for "${parent.title}"?` : "What must be true for this connection to hold?"}
                    rows={2}
                    className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5 block">
                    Evidence
                  </label>
                  <textarea
                    value={evidenceDraft}
                    onChange={(e) => handleEvidenceChange(e.target.value)}
                    placeholder="Supporting data, research, observations..."
                    rows={2}
                    className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
            </div>
          )}
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

          {validChildTypes.length > 0 && (
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
        </p>
      </div>
    </div>
  );
}
