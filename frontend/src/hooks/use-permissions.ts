"use client";

import { useTreeStore } from "@/stores/tree-store";
import { useProject } from "@/hooks/use-tree";

/**
 * Returns true if the current user can edit (role is owner or editor).
 * Single-user mode: no role means full access (implicit owner).
 */
export function useCanEdit(): boolean {
  const currentTree = useTreeStore((s) => s.currentTree);
  const { data: project } = useProject(currentTree?.project_id ?? null);
  const myRole = project?.my_role;
  // Single user: no role means full access (implicit owner)
  if (myRole === undefined || myRole === null) return true;
  return myRole === "owner" || myRole === "editor";
}

/**
 * Returns true if the current user is an owner.
 * Single-user mode: no role means implicit owner.
 */
export function useIsOwner(): boolean {
  const currentTree = useTreeStore((s) => s.currentTree);
  const { data: project } = useProject(currentTree?.project_id ?? null);
  const myRole = project?.my_role;
  if (myRole === undefined || myRole === null) return true;
  return myRole === "owner";
}
