"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useProjectTags, useAddTagToNode, useRemoveTagFromNode } from "@/hooks/use-tree";
import { TreeWithNodes, Tag } from "@/lib/types";

export function NodeTagsSection({
  nodeId,
  nodeTags,
  tree,
}: {
  nodeId: string;
  nodeTags: string[];
  tree: TreeWithNodes;
}) {
  const { data: projectTags } = useProjectTags(tree.project_id);
  const addTag = useAddTagToNode(tree.id, tree.project_id);
  const removeTag = useRemoveTagFromNode(tree.id);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const availableTags = (projectTags || []).filter((t) => !nodeTags.includes(t.name));

  // Position the dropdown when it opens, flipping upward if it would overflow viewport
  useEffect(() => {
    if (showDropdown && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Estimate dropdown height: ~30px per tag option + ~40px for divider+input row + ~12px padding
      const estimatedHeight = availableTags.length * 30 + 52;
      const spaceBelow = window.innerHeight - rect.bottom - 4;
      if (spaceBelow < estimatedHeight) {
        // Flip upward
        setPos({ top: rect.top - estimatedHeight - 4, left: rect.left });
      } else {
        setPos({ top: rect.bottom + 4, left: rect.left });
      }
    }
  }, [showDropdown, availableTags.length]);

  // Close on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown]);

  const handleAddExisting = (tagName: string) => {
    addTag.mutate({ nodeId, tagName });
    setShowDropdown(false);
  };

  const handleCreateAndAdd = () => {
    if (!newTagName.trim()) return;
    addTag.mutate({ nodeId, tagName: newTagName.trim() });
    setNewTagName("");
    setShowDropdown(false);
  };

  const handleRemove = (tag: Tag) => {
    removeTag.mutate({ nodeId, tagId: tag.id });
  };

  const currentTagObjects = (projectTags || []).filter((t) => nodeTags.includes(t.name));

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Tags</p>
      <div className="flex flex-wrap gap-1.5 items-center">
        {currentTagObjects.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border"
            style={{ backgroundColor: tag.color + "20", borderColor: tag.color }}
          >
            <span style={{ color: tag.color }}>{tag.name}</span>
            <button
              onClick={() => handleRemove(tag)}
              className="text-gray-400 hover:text-red-500 text-[10px] leading-none"
            >
              &times;
            </button>
          </span>
        ))}
        {nodeTags
          .filter((tn) => !currentTagObjects.find((t) => t.name === tn))
          .map((tn) => (
            <span key={tn} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 border text-gray-600">
              {tn}
            </span>
          ))}
        <button
          ref={buttonRef}
          onClick={() => setShowDropdown(!showDropdown)}
          className="text-xs px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400"
        >
          + Tag
        </button>
        {showDropdown && createPortal(
          <div
            ref={dropdownRef}
            className="fixed bg-white border rounded-lg shadow-lg w-52 z-50 pt-1 pb-2"
            style={{ top: pos.top, left: pos.left }}
          >
            {availableTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => handleAddExisting(tag.name)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </button>
            ))}
            <div className="h-px bg-gray-100 my-1" />
            <div className="px-2 py-1 flex gap-1">
              <input
                type="text"
                placeholder="New tag..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateAndAdd(); }}
                className="flex-1 min-w-0 text-xs border rounded px-2 py-1 outline-none"
                autoFocus
              />
              <button
                onClick={handleCreateAndAdd}
                disabled={!newTagName.trim()}
                className="text-xs px-2 py-1 bg-[#0d9488] text-white rounded hover:bg-[#0b7a70] disabled:opacity-50 shrink-0"
              >
                Add
              </button>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
