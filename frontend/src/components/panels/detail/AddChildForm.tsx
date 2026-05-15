"use client";

import { useState } from "react";
import { useAddNode } from "@/hooks/use-tree";
import { BubbleDefaults } from "@/lib/types";
import { getNodeLabel } from "@/lib/colors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddChildForm({
  selectedNodeId,
  treeId,
  validChildTypes,
  bubbleDefaults,
}: {
  selectedNodeId: string;
  treeId: string;
  validChildTypes: string[];
  bubbleDefaults?: BubbleDefaults;
}) {
  const addNode = useAddNode(treeId);
  const [newNodeTitle, setNewNodeTitle] = useState("");
  const [newNodeType, setNewNodeType] = useState<string>("");

  const handleAddChild = () => {
    if (!newNodeTitle || !newNodeType) return;
    addNode.mutate(
      { title: newNodeTitle, node_type: newNodeType, parent_id: selectedNodeId },
      {
        onSuccess: () => {
          setNewNodeTitle("");
          setNewNodeType("");
        },
      }
    );
  };

  if (validChildTypes.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-faint mb-1.5">Add Child</p>
      <div className="space-y-1.5">
        <Input
          placeholder="Node title"
          value={newNodeTitle}
          onChange={(e) => setNewNodeTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddChild()}
          className="text-sm w-full h-8"
        />
        <div className="flex gap-1.5">
          <select
            className="border rounded px-2 py-1 text-xs flex-1"
            value={newNodeType}
            onChange={(e) => setNewNodeType(e.target.value)}
          >
            <option value="">Type...</option>
            {validChildTypes.map((t) => (
              <option key={t} value={t}>
                {getNodeLabel(t, bubbleDefaults)}
              </option>
            ))}
          </select>
          <Button
            onClick={handleAddChild}
            disabled={!newNodeTitle || !newNodeType || addNode.isPending}
            className="bg-[#0d9488] hover:bg-[#0b7a70] text-white text-xs h-7 px-3"
          >
            {addNode.isPending ? "..." : "Add"}
          </Button>
        </div>
      </div>
    </div>
  );
}
