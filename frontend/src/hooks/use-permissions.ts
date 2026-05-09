"use client";

import { useTreeStore } from "@/stores/tree-store";
import { useProject } from "@/hooks/use-tree";

/**
 * Returns true if the current user can edit (role is owner or editor).
 * In open mode (no auth / no my_role), editing is always allowed.
 */
export function useCanEdit(): boolean {
  const currentTree = useTreeStore((s) => s.currentTree);
  const { data: project } = useProject(currentTree?.project_id ?? null);
  const myRole = project?.my_role;
  // Open mode or single user: no role means full access
  if (myRole === undefined || myRole === null) return true;
  return myRole === "owner" || myRole === "editor";
}

/**
 * Returns true if the current user is an owner.
 * In open mode (no auth / no my_role), owner is assumed.
 */
export function useIsOwner(): boolean {
  const currentTree = useTreeStore((s) => s.currentTree);
  const { data: project } = useProject(currentTree?.project_id ?? null);
  const myRole = project?.my_role;
  if (myRole === undefined || myRole === null) return true;
  return myRole === "owner";
}
