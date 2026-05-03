"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useProjectList,
  useCreateProject,
  useDeleteProject,
  useCreateTree,
  useDeleteTree,
  useImportTree,
} from "@/hooks/use-tree";
import { api } from "@/lib/api-client";
import { Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface TreeSelectorProps {
  selectedTreeId: string | null;
  onSelectTree: (id: string) => void;
}

export function TreeSelector({ selectedTreeId, onSelectTree }: TreeSelectorProps) {
  const queryClient = useQueryClient();
  const { data: projects, isLoading } = useProjectList();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const createTree = useCreateTree();
  const deleteTree = useDeleteTree();
  const importTree = useImportTree();

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");

  const [treeDialogProjectId, setTreeDialogProjectId] = useState<string | null>(null);
  const [newTreeName, setNewTreeName] = useState("");
  const [newTreeDesc, setNewTreeDesc] = useState("");
  const [treeDialogMode, setTreeDialogMode] = useState<"create" | "import">("create");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<string | null>(null);

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState("");

  const [editingTreeId, setEditingTreeId] = useState<string | null>(null);
  const [editTreeName, setEditTreeName] = useState("");

  const toggleProject = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateProject = () => {
    if (!newProjectName) return;
    createProject.mutate(
      { name: newProjectName, description: newProjectDesc },
      {
        onSuccess: (project) => {
          setExpandedProjects((prev) => new Set(prev).add(project.id));
          setNewProjectName("");
          setNewProjectDesc("");
          setProjectDialogOpen(false);
        },
      }
    );
  };

  const handleCreateTree = () => {
    if (!newTreeName || !treeDialogProjectId) return;
    createTree.mutate(
      { name: newTreeName, description: newTreeDesc, project_id: treeDialogProjectId },
      {
        onSuccess: (tree) => {
          onSelectTree(tree.id);
          setNewTreeName("");
          setNewTreeDesc("");
          setTreeDialogProjectId(null);
        },
      }
    );
  };

  const handleImportTree = () => {
    if (!importFile || !treeDialogProjectId) return;
    setImportError(null);
    importTree.mutate(
      { projectId: treeDialogProjectId, file: importFile },
      {
        onSuccess: (result) => {
          onSelectTree(result.id);
          setImportFile(null);
          setImportError(null);
          setTreeDialogMode("create");
          setTreeDialogProjectId(null);
        },
        onError: (err) => {
          setImportError(err instanceof Error ? err.message : "Import failed");
        },
      }
    );
  };

  const handleDeleteTree = (id: string) => {
    deleteTree.mutate(id);
    setConfirmDeleteId(null);
  };

  const handleDeleteProject = (id: string) => {
    deleteProject.mutate(id);
    setConfirmDeleteProjectId(null);
  };

  const handleRenameProject = async (id: string) => {
    if (!editProjectName) return;
    await api.projects.update(id, { name: editProjectName });
    setEditingProjectId(null);
    setEditProjectName("");
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["project", id] });
  };

  const handleRenameTree = async (id: string) => {
    if (!editTreeName) return;
    await api.trees.update(id, { name: editTreeName });
    setEditingTreeId(null);
    setEditTreeName("");
    queryClient.invalidateQueries({ queryKey: ["trees"] });
    queryClient.invalidateQueries({ queryKey: ["tree", id] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["project"] });
  };

  if (isLoading) return <div className="p-2 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Projects</h2>
        <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              + New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <Input
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
              />
              <Textarea
                placeholder="Description (optional)"
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                rows={2}
              />
              <Button
                onClick={handleCreateProject}
                disabled={!newProjectName || createProject.isPending}
                className="w-full"
              >
                {createProject.isPending ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-1">
        {projects?.map((project) => (
          <ProjectAccordion
            key={project.id}
            project={project}
            isExpanded={expandedProjects.has(project.id)}
            onToggle={() => toggleProject(project.id)}
            selectedTreeId={selectedTreeId}
            onSelectTree={onSelectTree}
            onNewTree={() => {
              setTreeDialogProjectId(project.id);
              setExpandedProjects((prev) => new Set(prev).add(project.id));
            }}
            confirmDeleteId={confirmDeleteId}
            onDeleteClick={(id, e) => {
              e.stopPropagation();
              setConfirmDeleteId(confirmDeleteId === id ? null : id);
            }}
            onConfirmDelete={handleDeleteTree}
            onCancelDelete={() => setConfirmDeleteId(null)}
            confirmDeleteProjectId={confirmDeleteProjectId}
            onDeleteProjectClick={(e) => {
              e.stopPropagation();
              setConfirmDeleteProjectId(
                confirmDeleteProjectId === project.id ? null : project.id
              );
            }}
            onConfirmDeleteProject={() => handleDeleteProject(project.id)}
            onCancelDeleteProject={() => setConfirmDeleteProjectId(null)}
            editingProjectId={editingProjectId}
            editProjectName={editProjectName}
            onStartEdit={() => {
              setEditingProjectId(project.id);
              setEditProjectName(project.name);
            }}
            onEditNameChange={setEditProjectName}
            onSaveEdit={() => handleRenameProject(project.id)}
            onCancelEdit={() => setEditingProjectId(null)}
            editingTreeId={editingTreeId}
            editTreeName={editTreeName}
            onStartTreeEdit={(treeId: string, treeName: string) => {
              setEditingTreeId(treeId);
              setEditTreeName(treeName);
            }}
            onEditTreeNameChange={setEditTreeName}
            onSaveTreeEdit={(treeId: string) => handleRenameTree(treeId)}
            onCancelTreeEdit={() => setEditingTreeId(null)}
          />
        ))}
        {projects?.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">
            No projects yet. Create one to get started!
          </p>
        )}
      </div>

      {/* New Tree dialog (shared) */}
      <Dialog
        open={!!treeDialogProjectId}
        onOpenChange={(open) => {
          if (!open) {
            setTreeDialogProjectId(null);
            setTreeDialogMode("create");
            setImportFile(null);
            setImportError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {treeDialogMode === "create" ? "Create New Tree" : "Import Tree"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {/* Mode toggle */}
            <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
              <button
                onClick={() => setTreeDialogMode("create")}
                className={`flex-1 text-xs py-1.5 rounded transition-colors ${
                  treeDialogMode === "create"
                    ? "bg-white shadow-sm font-medium text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Create New
              </button>
              <button
                onClick={() => setTreeDialogMode("import")}
                className={`flex-1 text-xs py-1.5 rounded transition-colors ${
                  treeDialogMode === "import"
                    ? "bg-white shadow-sm font-medium text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Import from File
              </button>
            </div>

            {treeDialogMode === "create" ? (
              <>
                <Input
                  placeholder="Tree name"
                  value={newTreeName}
                  onChange={(e) => setNewTreeName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateTree()}
                />
                <Textarea
                  placeholder="Description (optional)"
                  value={newTreeDesc}
                  onChange={(e) => setNewTreeDesc(e.target.value)}
                  rows={2}
                />
                <Button
                  onClick={handleCreateTree}
                  disabled={!newTreeName || createTree.isPending}
                  className="w-full"
                >
                  {createTree.isPending ? "Creating..." : "Create Tree"}
                </Button>
              </>
            ) : (
              <>
                <div className="border-2 border-dashed border-gray-200 rounded-md p-4 text-center">
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setImportFile(file);
                      setImportError(null);
                    }}
                    className="hidden"
                    id="import-tree-file"
                  />
                  <label
                    htmlFor="import-tree-file"
                    className="cursor-pointer text-sm text-gray-500 hover:text-[#0d9488]"
                  >
                    {importFile ? (
                      <span className="text-gray-900 font-medium">{importFile.name}</span>
                    ) : (
                      "Click to select a JSON file"
                    )}
                  </label>
                </div>
                {importError && (
                  <p className="text-xs text-red-500">{importError}</p>
                )}
                <Button
                  onClick={handleImportTree}
                  disabled={!importFile || importTree.isPending}
                  className="w-full"
                >
                  {importTree.isPending ? "Importing..." : "Import Tree"}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ProjectAccordionProps {
  project: Project;
  isExpanded: boolean;
  onToggle: () => void;
  selectedTreeId: string | null;
  onSelectTree: (id: string) => void;
  onNewTree: () => void;
  confirmDeleteId: string | null;
  onDeleteClick: (id: string, e: React.MouseEvent) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  confirmDeleteProjectId: string | null;
  onDeleteProjectClick: (e: React.MouseEvent) => void;
  onConfirmDeleteProject: () => void;
  onCancelDeleteProject: () => void;
  editingProjectId: string | null;
  editProjectName: string;
  onStartEdit: () => void;
  onEditNameChange: (name: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  editingTreeId: string | null;
  editTreeName: string;
  onStartTreeEdit: (treeId: string, treeName: string) => void;
  onEditTreeNameChange: (name: string) => void;
  onSaveTreeEdit: (treeId: string) => void;
  onCancelTreeEdit: () => void;
}

function ProjectAccordion({
  project,
  isExpanded,
  onToggle,
  selectedTreeId,
  onSelectTree,
  onNewTree,
  confirmDeleteId,
  onDeleteClick,
  onConfirmDelete,
  onCancelDelete,
  confirmDeleteProjectId,
  onDeleteProjectClick,
  onConfirmDeleteProject,
  onCancelDeleteProject,
  editingProjectId,
  editProjectName,
  onStartEdit,
  onEditNameChange,
  onSaveEdit,
  onCancelEdit,
  editingTreeId,
  editTreeName,
  onStartTreeEdit,
  onEditTreeNameChange,
  onSaveTreeEdit,
  onCancelTreeEdit,
}: ProjectAccordionProps) {
  const { data: projectData } = useProjectData(project.id, isExpanded);
  const trees = projectData?.trees ?? [];

  return (
    <div className="border rounded-md overflow-hidden">
      {/* Project header */}
      <div className="group">
        <div
          onClick={onToggle}
          className="flex items-center justify-between px-2 py-1.5 bg-gray-50 hover:bg-gray-100 cursor-pointer"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs text-gray-400 shrink-0">
              {isExpanded ? "▼\uFE0E" : "▶\uFE0E"}
            </span>
            {editingProjectId === project.id ? (
              <input
                className="text-sm font-medium bg-white border rounded px-1 py-0.5 w-full"
                value={editProjectName}
                onChange={(e) => onEditNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSaveEdit();
                  if (e.key === "Escape") onCancelEdit();
                }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            ) : (
              <span className="text-sm font-semibold truncate" title={project.name}>{project.name}</span>
            )}
            <span className="text-[10px] text-gray-400 shrink-0">
              ({projectData ? trees.length : "…"})
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartEdit();
              }}
              className="text-gray-400 hover:text-[#0d9488] p-0.5 rounded hover:bg-[#e6f4f3]"
              title="Rename project"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            </button>
            <button
              onClick={onDeleteProjectClick}
              className="text-gray-400 hover:text-red-500 p-0.5 rounded hover:bg-red-50"
              title="Delete project"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        {confirmDeleteProjectId === project.id && (
          <div className="flex gap-1 px-2 py-1 bg-gray-50" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="destructive"
              size="sm"
              className="text-[10px] h-5 flex-1"
              onClick={onConfirmDeleteProject}
            >
              Delete project
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-[10px] h-5 flex-1"
              onClick={onCancelDeleteProject}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Trees list */}
      {isExpanded && (
        <div className="bg-white">
          {trees.map((tree) => (
            <div key={tree.id} className="group/tree">
              <div
                onClick={() => onSelectTree(tree.id)}
                className={`flex items-center justify-between pl-5 pr-2 py-1.5 cursor-pointer text-sm ${
                  selectedTreeId === tree.id
                    ? "bg-[#e6f4f3] text-[#0b7a70] border-l-2 border-[#0d9488]"
                    : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={14} height={14} className="shrink-0 text-[#0d9488]"><circle cx="32" cy="18" r="5" fill="currentColor"/><path d="M32 23L32 32M32 32L18 42M32 32L32 42M32 32L46 42" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none"/><circle cx="18" cy="45" r="4" fill="currentColor"/><circle cx="32" cy="45" r="4" fill="currentColor"/><circle cx="46" cy="45" r="4" fill="currentColor"/></svg>
                  {editingTreeId === tree.id ? (
                    <input
                      className="text-sm bg-white border rounded px-1 py-0.5 w-full"
                      value={editTreeName}
                      onChange={(e) => onEditTreeNameChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onSaveTreeEdit(tree.id);
                        if (e.key === "Escape") onCancelTreeEdit();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span className="truncate" title={tree.name}>{tree.name}</span>
                  )}
                  <TreeNodeCount treeId={tree.id} />
                </div>
                <div className="flex items-center gap-0.5 ml-1 shrink-0 opacity-0 group-hover/tree:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartTreeEdit(tree.id, tree.name);
                    }}
                    className="text-gray-400 hover:text-[#0d9488] p-0.5 rounded hover:bg-[#e6f4f3]"
                    title="Rename tree"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      api.trees.exportTree(tree.id).then((exportData) => {
                        const json = JSON.stringify(exportData, null, 2);
                        const blob = new Blob([json], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${tree.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      });
                    }}
                    className="text-gray-400 hover:text-[#0d9488] p-0.5 rounded hover:bg-[#e6f4f3]"
                    title="Export as JSON"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                  </button>
                  <button
                    onClick={(e) => onDeleteClick(tree.id, e)}
                    className="text-gray-400 hover:text-red-500 p-0.5 rounded hover:bg-red-50"
                    title="Delete tree"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
              {confirmDeleteId === tree.id && (
                <div className="flex gap-1 pl-6 pr-2 pb-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="text-[10px] h-5 flex-1"
                    onClick={() => onConfirmDelete(tree.id)}
                  >
                    Delete
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[10px] h-5 flex-1"
                    onClick={onCancelDelete}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          ))}
          <button
            onClick={onNewTree}
            className="w-full text-left pl-6 pr-2 py-1.5 text-xs text-gray-400 hover:text-[#0d9488] hover:bg-gray-50"
          >
            + New Tree
          </button>
        </div>
      )}
    </div>
  );
}

// Hook to fetch project with trees (only when expanded)
import { useQuery } from "@tanstack/react-query";

function useProjectData(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.projects.get(projectId),
    enabled,
  });
}

function TreeNodeCount({ treeId }: { treeId: string }) {
  const { data } = useQuery({
    queryKey: ["tree", treeId],
    queryFn: () => api.trees.get(treeId),
    staleTime: 30000, // cache for 30s to avoid excessive requests
  });
  if (!data || data.nodes.length === 0) return null;
  return (
    <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 min-w-[20px] text-center ml-1">
      {data.nodes.length}
    </span>
  );
}
