"use client";

import { useEffect, useState } from "react";
import { useUpdateTree, useProject, useUpdateProject, useProjectTags, useCreateTag, useUpdateTag, useDeleteTag, useBubbleDefaults, useUpdateBubbleDefaults } from "@/hooks/use-tree";
import { TreeWithNodes, BubbleDefaults, BubbleTypeDefault, STANDARD_NODE_TYPES, FillStyle } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { DEFAULT_BUBBLE_DEFAULTS, getNodeLabel } from "@/lib/colors";
import { getFillStyle, FILL_STYLE_OPTIONS } from "@/lib/fill-patterns";
import MembersSection from "@/components/panels/MembersSection";

interface ContextPanelProps {
  tree: TreeWithNodes;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function ContextPanel({ tree }: ContextPanelProps) {
  const { data: project } = useProject(tree.project_id);
  const updateProject = useUpdateProject(tree.project_id);
  const updateTree = useUpdateTree(tree.id);

  const [projectContext, setProjectContext] = useState(project?.project_context ?? "");
  const [treeContext, setTreeContext] = useState(tree.tree_context);
  const [projectDirty, setProjectDirty] = useState(false);
  const [treeDirty, setTreeDirty] = useState(false);

  const hasProjectChanges = projectContext !== (project?.project_context ?? "");
  const hasTreeChanges = treeContext !== tree.tree_context;

  // Sync when tree changes (only if not dirty)
  useEffect(() => {
    if (!treeDirty) {
      setTreeContext(tree.tree_context);
    }
  }, [tree.id, tree.tree_context, treeDirty]);

  // Reset dirty on tree switch
  useEffect(() => {
    setTreeDirty(false);
    setProjectDirty(false);
  }, [tree.id]);

  // Sync when project changes (only if not dirty)
  useEffect(() => {
    if (project && !projectDirty) {
      setProjectContext(project.project_context);
    }
  }, [project?.id, project?.project_context, projectDirty]);

  const handleSaveProjectContext = () => {
    updateProject.mutate({ project_context: projectContext }, {
      onSuccess: () => setProjectDirty(false),
    });
  };

  const handleSaveTreeContext = () => {
    updateTree.mutate({ tree_context: treeContext }, {
      onSuccess: () => setTreeDirty(false),
    });
  };

  const { data: projectTags } = useProjectTags(tree.project_id);
  const createTag = useCreateTag(tree.project_id);
  const updateTag = useUpdateTag(tree.project_id, tree.id);
  const deleteTag = useDeleteTag(tree.project_id);
  const [newTagName, setNewTagName] = useState("");
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
  const [tagColorPickerOpen, setTagColorPickerOpen] = useState<string | null>(null);

  // Bubble defaults
  const { data: bubbleDefaults } = useBubbleDefaults(tree.project_id);
  const updateBubbleDefaults = useUpdateBubbleDefaults(tree.project_id);
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null);

  const currentDefaults: BubbleDefaults = bubbleDefaults ?? DEFAULT_BUBBLE_DEFAULTS;

  const handleBubbleDefaultChange = (nodeType: string, field: keyof BubbleTypeDefault, value: string | number | boolean) => {
    const updated = { ...currentDefaults };
    updated[nodeType] = { ...updated[nodeType], [field]: value };
    updateBubbleDefaults.mutate(updated);
  };

  const handleResetDefaults = () => {
    // Reset standard types to defaults, remove custom types
    updateBubbleDefaults.mutate({ ...DEFAULT_BUBBLE_DEFAULTS });
  };

  // Derive type list: standard first, then custom from currentDefaults keys
  const standardTypes: string[] = [...STANDARD_NODE_TYPES];
  const customTypes = Object.keys(currentDefaults).filter(
    (k) => !standardTypes.includes(k)
  );
  const allTypes = [...standardTypes, ...customTypes];

  const isDefaultColors = standardTypes.every((nt) => {
    const cur = currentDefaults[nt];
    const def = DEFAULT_BUBBLE_DEFAULTS[nt];
    return cur?.border_color === def?.border_color && cur?.border_width === def?.border_width;
  }) && customTypes.length === 0;

  // Custom bubble type creation
  const [newBubbleLabel, setNewBubbleLabel] = useState("");
  const [newBubbleSlug, setNewBubbleSlug] = useState("");
  const [newBubbleColor, setNewBubbleColor] = useState("#94a3b8");
  const [newBubbleColorPickerOpen, setNewBubbleColorPickerOpen] = useState(false);
  const [slugError, setSlugError] = useState("");

  const handleLabelChange = (label: string) => {
    setNewBubbleLabel(label);
    const auto = slugify(label);
    setNewBubbleSlug(auto);
    validateSlug(auto);
  };

  const validateSlug = (slug: string) => {
    if (!slug) { setSlugError(""); return false; }
    if (standardTypes.includes(slug)) { setSlugError("Conflicts with standard type"); return false; }
    if (currentDefaults[slug]) { setSlugError("Type already exists"); return false; }
    if (!/^[a-z][a-z0-9_]*$/.test(slug)) { setSlugError("Invalid slug format"); return false; }
    setSlugError("");
    return true;
  };

  const handleAddCustomType = () => {
    if (!newBubbleLabel.trim() || !newBubbleSlug.trim()) return;
    if (!validateSlug(newBubbleSlug)) return;
    const updated = { ...currentDefaults };
    updated[newBubbleSlug] = {
      border_color: newBubbleColor,
      border_width: 2,
      label: newBubbleLabel.trim(),
    };
    updateBubbleDefaults.mutate(updated);
    setNewBubbleLabel("");
    setNewBubbleSlug("");
    setNewBubbleColor("#94a3b8");
  };

  const [deletingCustomType, setDeletingCustomType] = useState<string | null>(null);

  // Count nodes per custom type in the current tree
  const customTypeNodeCounts = new Map<string, number>();
  for (const node of tree.nodes) {
    if (!standardTypes.includes(node.node_type)) {
      customTypeNodeCounts.set(node.node_type, (customTypeNodeCounts.get(node.node_type) || 0) + 1);
    }
  }

  const handleDeleteCustomType = (slug: string) => {
    const updated = { ...currentDefaults };
    delete updated[slug];
    updateBubbleDefaults.mutate(updated);
    setDeletingCustomType(null);
  };

  // Count usage per tag from tree nodes
  const tagUsageCounts = new Map<string, number>();
  for (const node of tree.nodes) {
    if (node.tags) {
      for (const tagName of node.tags) {
        tagUsageCounts.set(tagName, (tagUsageCounts.get(tagName) || 0) + 1);
      }
    }
  }

  return (
    <div className="p-3 flex flex-col h-full overflow-y-auto space-y-3">
      {/* Side-by-side context textareas */}
      <div className="grid grid-cols-2 gap-4">
        {/* Project Context */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Project Context</span>
            <Badge variant="outline" className="text-[10px] py-0">shared</Badge>
          </div>
          <div className="relative">
            <Textarea
              value={projectContext}
              onChange={(e) => { setProjectContext(e.target.value); setProjectDirty(true); }}
              placeholder="Project background: what is it about? Who are the stakeholders? What constraints exist?"
              className="text-sm resize-y pb-8 min-h-[60px] overflow-y-auto"
              rows={2}
            />
            {hasProjectChanges && (
              <Button
                size="sm"
                onClick={handleSaveProjectContext}
                disabled={updateProject.isPending}
                className="absolute bottom-2 right-2 h-6 text-[10px] px-2 shadow-sm z-10"
              >
                {updateProject.isPending ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
        </div>

        {/* Tree Context */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tree Context</span>
            <Badge variant="outline" className="text-[10px] py-0">this tree</Badge>
          </div>
          <div className="relative">
            <Textarea
              value={treeContext}
              onChange={(e) => { setTreeContext(e.target.value); setTreeDirty(true); }}
              placeholder="Context specific to this OST: what area does it focus on? Any relevant research or findings?"
              className="text-sm resize-y pb-8 min-h-[60px] overflow-y-auto"
              rows={2}
            />
            {hasTreeChanges && (
              <Button
                size="sm"
                onClick={handleSaveTreeContext}
                disabled={updateTree.isPending}
                className="absolute bottom-2 right-2 h-6 text-[10px] px-2 shadow-sm z-10"
              >
                {updateTree.isPending ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Agent Knowledge */}
      <div className="border-t border-gray-100 pt-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Agent Knowledge</span>
          <Badge variant="outline" className="text-[10px] py-0">AI-maintained</Badge>
        </div>
        {tree.agent_knowledge ? (
          <div className="bg-gray-50 border rounded-md p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-[160px] overflow-y-auto">
            {tree.agent_knowledge}
          </div>
        ) : (
          <div className="bg-gray-50 border border-dashed rounded-md p-3 text-center text-xs text-gray-400">
            The AI coach will populate this as it learns about your project through chat.
          </div>
        )}
      </div>

      {/* Bubble Type Defaults + Tags side-by-side */}
      <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3">
        {/* Left: Bubble Type Defaults */}
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Bubble Type Defaults</span>
            <Badge variant="outline" className="text-[10px] py-0">project-wide</Badge>
            {!isDefaultColors && (
              <button
                onClick={handleResetDefaults}
                className="ml-auto text-[10px] text-gray-400 hover:text-gray-600 underline"
              >
                Reset
              </button>
            )}
          </div>
          <div className="space-y-1">
            {allTypes.map((nt) => {
              const defaults = currentDefaults[nt] ?? DEFAULT_BUBBLE_DEFAULTS[nt] ?? { border_color: "#94a3b8", border_width: 2 };
              const isCustom = !standardTypes.includes(nt);
              return (
                <div key={nt} className="px-1.5 py-1 rounded-md hover:bg-gray-50">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Preview swatch */}
                    <div
                      className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center"
                      style={{
                        borderColor: defaults.border_color,
                        borderWidth: `${defaults.border_width}px`,
                        borderStyle: "solid",
                        backgroundColor: "white",
                      }}
                    >
                      {defaults.font_light && <span className="text-[9px] font-bold text-gray-400" title="Light font enabled">L</span>}
                    </div>
                    {/* Type label */}
                    <span className="text-xs font-medium text-gray-700 min-w-[80px] truncate" title={nt}>
                      {getNodeLabel(nt, currentDefaults)}
                      {isCustom && <span className="text-[9px] text-gray-400 ml-1">custom</span>}
                    </span>
                    {/* Color picker */}
                    <div className="relative ml-auto">
                      <button
                        className="flex items-center gap-1 border rounded px-1.5 py-0.5 hover:bg-gray-50"
                        onClick={() => setColorPickerOpen(colorPickerOpen === nt ? null : nt)}
                        aria-label={`Change color for ${getNodeLabel(nt, currentDefaults)}`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded border"
                          style={{ backgroundColor: defaults.border_color }}
                        />
                        <span className="text-[10px] font-mono text-gray-500">{defaults.border_color}</span>
                      </button>
                      {colorPickerOpen === nt && (
                        <ColorPicker
                          color={defaults.border_color}
                          onChange={(c) => handleBubbleDefaultChange(nt, "border_color", c)}
                          onClose={() => setColorPickerOpen(null)}
                        />
                      )}
                    </div>
                    {/* Width control */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-400">W</span>
                      <input
                        type="range"
                        min={1}
                        max={6}
                        step={0.5}
                        value={defaults.border_width}
                        onChange={(e) => handleBubbleDefaultChange(nt, "border_width", parseFloat(e.target.value))}
                        className="w-14 h-3 accent-gray-500"
                        aria-label={`Border width for ${getNodeLabel(nt, currentDefaults)}`}
                      />
                      <span className="text-[10px] font-medium text-gray-600 w-5 text-center bg-gray-100 rounded">{defaults.border_width}</span>
                    </div>
                    {/* Light font toggle */}
                    <label className="flex items-center gap-0.5 cursor-pointer" title="Light (white) text for dark fill colors">
                      <span className="text-[10px] text-gray-400">L</span>
                      <input
                        type="checkbox"
                        checked={defaults.font_light ?? false}
                        onChange={(e) => handleBubbleDefaultChange(nt, "font_light", e.target.checked)}
                        className="w-3 h-3 accent-gray-500"
                      />
                    </label>
                    {/* Delete button for custom types */}
                    {isCustom && (
                      <>
                        {deletingCustomType === nt ? (
                          <span className="flex items-center gap-1">
                            {(customTypeNodeCounts.get(nt) ?? 0) > 0 && (
                              <span className="text-[9px] text-amber-600">
                                {customTypeNodeCounts.get(nt)} node{(customTypeNodeCounts.get(nt) ?? 0) > 1 ? "s" : ""}
                              </span>
                            )}
                            <button
                              onClick={() => handleDeleteCustomType(nt)}
                              className="text-[9px] px-1.5 py-0.5 bg-red-500 text-white rounded"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setDeletingCustomType(null)}
                              className="text-[9px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setDeletingCustomType(nt)}
                            className="text-gray-400 hover:text-red-500 text-sm"
                            title="Delete custom type"
                          >
                            ×
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Custom Bubble Type */}
          <div className="mt-2 border-t border-gray-100 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Add Custom Type</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <input
                type="text"
                placeholder="Label (e.g. User Story)"
                value={newBubbleLabel}
                onChange={(e) => handleLabelChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCustomType()}
                className="text-xs border rounded px-2 py-1 outline-none w-28"
              />
              <div className="text-[10px] text-gray-400 font-mono truncate max-w-[60px]" title={newBubbleSlug || "slug"}>
                {newBubbleSlug || "slug"}
              </div>
              {/* Color swatch */}
              <div className="relative">
                <button
                  className="w-5 h-5 rounded border-2 border-gray-200"
                  style={{ backgroundColor: newBubbleColor }}
                  onClick={() => setNewBubbleColorPickerOpen(!newBubbleColorPickerOpen)}
                  title="Pick color"
                />
                {newBubbleColorPickerOpen && (
                  <ColorPicker
                    color={newBubbleColor}
                    onChange={(c) => setNewBubbleColor(c)}
                    onClose={() => setNewBubbleColorPickerOpen(false)}
                  />
                )}
              </div>
              <Button
                size="sm"
                className="h-5 text-[10px] px-2"
                disabled={!newBubbleLabel.trim() || !newBubbleSlug.trim() || !!slugError}
                onClick={handleAddCustomType}
              >
                Add
              </Button>
            </div>
            {slugError && <p className="text-[10px] text-red-500 mt-1">{slugError}</p>}
          </div>
        </div>

        {/* Right: Tags */}
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tags</span>
            <Badge variant="outline" className="text-[10px] py-0">project-wide</Badge>
          </div>
          <div className="space-y-1">
            {projectTags && projectTags.length > 0 && projectTags.map((tag) => (
              <div key={tag.id} className="px-1.5 py-1 rounded-md hover:bg-gray-50">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Preview swatch with fill */}
                  <div
                    className="w-7 h-7 rounded-md shrink-0 border"
                    style={{
                      borderColor: tag.color,
                      borderWidth: "2px",
                      ...getFillStyle(tag.color, tag.fill_style),
                    }}
                  />
                  {/* Tag name + usage count */}
                  <span className="text-xs font-medium text-gray-700 min-w-[50px] truncate" title={tag.name}>
                    {tag.name}
                    <span className="text-[10px] text-gray-400 ml-1">({tagUsageCounts.get(tag.name) || 0})</span>
                  </span>
                  {/* Color picker */}
                  <div className="relative ml-auto">
                    <button
                      className="flex items-center gap-1 border rounded px-1.5 py-0.5 hover:bg-gray-50"
                      onClick={() => setTagColorPickerOpen(tagColorPickerOpen === tag.id ? null : tag.id)}
                      aria-label={`Change color for tag ${tag.name}`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded border"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-[10px] font-mono text-gray-500">{tag.color}</span>
                    </button>
                    {tagColorPickerOpen === tag.id && (
                      <ColorPicker
                        color={tag.color}
                        onChange={(c) => updateTag.mutate({ tagId: tag.id, data: { color: c } })}
                        onClose={() => setTagColorPickerOpen(null)}
                      />
                    )}
                  </div>
                  {/* Fill style dropdown */}
                  <select
                    value={tag.fill_style || "none"}
                    onChange={(e) => updateTag.mutate({ tagId: tag.id, data: { fill_style: e.target.value } })}
                    className="text-[10px] border rounded px-1 py-0.5 bg-white text-gray-600 outline-none"
                    aria-label={`Fill style for tag ${tag.name}`}
                  >
                    {FILL_STYLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {/* Light font toggle */}
                  <label className="flex items-center gap-0.5 cursor-pointer" title="Light (white) text for dark fill colors">
                    <span className="text-[10px] text-gray-400">L</span>
                    <input
                      type="checkbox"
                      checked={tag.font_light ?? false}
                      onChange={(e) => updateTag.mutate({ tagId: tag.id, data: { font_light: e.target.checked } })}
                      className="w-3 h-3 accent-gray-500"
                    />
                  </label>
                  {/* Delete button */}
                  {deletingTagId === tag.id ? (
                    <span className="flex items-center gap-0.5">
                      <button
                        onClick={() => { deleteTag.mutate(tag.id); setDeletingTagId(null); }}
                        className="text-[9px] px-1.5 py-0.5 bg-red-500 text-white rounded"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeletingTagId(null)}
                        className="text-[9px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setDeletingTagId(tag.id)}
                      className="text-gray-400 hover:text-red-500 text-sm"
                      title="Delete tag"
                      aria-label={`Delete tag ${tag.name}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Create new tag */}
          <div className="mt-2 flex items-center gap-1 flex-wrap">
            <input
              type="text"
              placeholder="new tag..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTagName.trim()) {
                  createTag.mutate({ name: newTagName.trim() });
                  setNewTagName("");
                }
              }}
              className="text-xs border rounded px-2 py-1 outline-none w-28"
            />
            <Button
              size="sm"
              className="h-5 text-[10px] px-2"
              disabled={!newTagName.trim() || createTag.isPending}
              onClick={() => {
                createTag.mutate({ name: newTagName.trim() });
                setNewTagName("");
              }}
            >
              Create
            </Button>
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="border-t border-gray-100 pt-3">
        <MembersSection projectId={tree.project_id} />
      </div>
    </div>
  );
}
