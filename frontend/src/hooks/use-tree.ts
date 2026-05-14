"use client";

import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { NodeCreate, NodeUpdate, ProjectCreate, ProjectUpdate, TreeCreate, TreeUpdate, TreeWithNodes, BubbleDefaults } from "@/lib/types";
import { useTreeStore } from "@/stores/tree-store";

function isConflictError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

// ── Project hooks ────────────────────────────────────────────

export function useProjectList() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });
}

export function useProject(projectId: string | null) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.projects.get(projectId!),
    enabled: !!projectId,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectCreate) => api.projects.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectUpdate) => api.projects.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
}

// ── Bubble defaults hooks ────────────────────────────────────

export function useBubbleDefaults(projectId: string | null) {
  return useQuery({
    queryKey: ["bubbleDefaults", projectId],
    queryFn: () => api.projects.getBubbleDefaults(projectId!),
    enabled: !!projectId,
  });
}

export function useUpdateBubbleDefaults(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BubbleDefaults) => api.projects.updateBubbleDefaults(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bubbleDefaults", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });
}

// ── Tree hooks ───────────────────────────────────────────────

export function useTreeList() {
  return useQuery({
    queryKey: ["trees"],
    queryFn: () => api.trees.list(),
  });
}

export function useTree(treeId: string | null) {
  return useQuery({
    queryKey: ["tree", treeId],
    queryFn: () => api.trees.get(treeId!),
    enabled: !!treeId,
  });
}

export function useCreateTree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TreeCreate) => api.trees.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trees"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project"] });
    },
  });
}

export function useUpdateTree(treeId: string) {
  const queryClient = useQueryClient();
  const setConflictWarning = useTreeStore((s) => s.setConflictWarning);
  return useMutation({
    mutationFn: (data: TreeUpdate) => api.trees.update(treeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tree", treeId] });
      queryClient.invalidateQueries({ queryKey: ["trees"] });
    },
    onError: (error) => {
      if (isConflictError(error)) {
        setConflictWarning("The tree was modified by someone else. Your changes could not be saved. The tree has been refreshed.");
        queryClient.invalidateQueries({ queryKey: ["tree", treeId] });
      }
    },
  });
}

export function useDeleteTree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.trees.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trees"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project"] });
    },
  });
}

export function useImportTree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, file, name }: { projectId: string; file: File; name?: string }) =>
      api.trees.importTree(projectId, file, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trees"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project"] });
    },
  });
}

// ── Node hooks ───────────────────────────────────────────────

export function useAddNode(treeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NodeCreate) => api.nodes.create(treeId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tree", treeId] }),
  });
}

export function useUpdateNode(treeId: string) {
  const queryClient = useQueryClient();
  const setConflictWarning = useTreeStore((s) => s.setConflictWarning);
  return useMutation({
    mutationFn: ({ nodeId, data }: { nodeId: string; data: NodeUpdate }) =>
      api.nodes.update(nodeId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tree", treeId] }),
    onError: (error) => {
      if (isConflictError(error)) {
        setConflictWarning("This node was modified by someone else. Your changes could not be saved. The tree has been refreshed.");
        queryClient.invalidateQueries({ queryKey: ["tree", treeId] });
      }
    },
  });
}

export function useDeleteNode(treeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nodeId: string) => api.nodes.delete(nodeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tree", treeId] }),
  });
}

export function useReorderNode(treeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, direction }: { nodeId: string; direction: "left" | "right" }) =>
      api.nodes.reorder(nodeId, direction),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tree", treeId] }),
  });
}

export function useUpdateEdge(treeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ edgeId, data }: { edgeId: string; data: { thickness?: number } }) =>
      api.edges.update(edgeId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tree", treeId] }),
  });
}

export function useMoveNode(treeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, newParentId }: { nodeId: string; newParentId: string }) =>
      api.nodes.move(nodeId, newParentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tree", treeId] }),
  });
}

export function useValidateTree(treeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.validation.validate(treeId),
  });
}

// ── Tag hooks ───────────────────────────────────────────────

export function useProjectTags(projectId: string | null) {
  return useQuery({
    queryKey: ["projectTags", projectId],
    queryFn: () => api.tags.list(projectId!),
    enabled: !!projectId,
  });
}

export function useCreateTag(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color?: string }) => api.tags.create(projectId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projectTags", projectId] }),
  });
}

export function useAddTagToNode(treeId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, tagName }: { nodeId: string; tagName: string }) =>
      api.tags.addToNode(nodeId, tagName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tree", treeId] });
      queryClient.invalidateQueries({ queryKey: ["projectTags", projectId] });
    },
  });
}

export function useRemoveTagFromNode(treeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, tagId }: { nodeId: string; tagId: string }) =>
      api.tags.removeFromNode(nodeId, tagId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tree", treeId] }),
  });
}

export function useUpdateTag(projectId: string, treeId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tagId, data }: { tagId: string; data: { color?: string; fill_style?: string | null; font_light?: boolean } }) =>
      api.tags.update(tagId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectTags", projectId] });
      if (treeId) {
        queryClient.invalidateQueries({ queryKey: ["tree", treeId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["tree"] });
      }
    },
  });
}

export function useDeleteTag(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) => api.tags.delete(tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projectTags", projectId] });
      // Refresh tree to remove deleted tags from nodes
      queryClient.invalidateQueries({ queryKey: ["tree"] });
    },
  });
}

// ── Auto-validate hook ──────────────────────────────────────

export function useAutoValidate(tree: TreeWithNodes | null | undefined) {
  const autoValidateEnabled = useTreeStore((s) => s.autoValidateEnabled);
  const setValidationReport = useTreeStore((s) => s.setValidationReport);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track node count + assumption changes as a change signal
  const nodeCount = tree?.nodes.length ?? 0;
  const assumptionSignal = tree?.nodes.map((n) => {
    const legacy = n.assumption || "";
    const multi = (n.assumptions || []).map((a) => `${a.text}:${a.status}`).join(",");
    return `${legacy}|${multi}`;
  }).join("||") ?? "";
  const treeId = tree?.id ?? null;

  useEffect(() => {
    if (!autoValidateEnabled || !treeId || nodeCount === 0) return;

    // Clear any pending timer
    if (timerRef.current) clearTimeout(timerRef.current);

    // Debounce validation by 2 seconds
    timerRef.current = setTimeout(async () => {
      try {
        const report = await api.validation.validate(treeId);
        setValidationReport(report);
      } catch {
        // Silently ignore auto-validate failures
      }
    }, 2000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoValidateEnabled, treeId, nodeCount, assumptionSignal, setValidationReport]);
}
