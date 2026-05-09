"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useIsOwner } from "@/hooks/use-permissions";
import type { ProjectMember, ProjectRole } from "@/lib/types";

interface MembersSectionProps {
  projectId: string;
}

export default function MembersSection({ projectId }: MembersSectionProps) {
  const isOwner = useIsOwner();
  const queryClient = useQueryClient();

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<ProjectRole>("editor");
  const [error, setError] = useState("");

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["members", projectId],
    queryFn: () => api.members.list(projectId),
    enabled: !!projectId,
  });

  const addMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) =>
      api.members.add(projectId, email, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", projectId] });
      setNewEmail("");
      setError("");
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.members.updateRole(projectId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", projectId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.members.remove(projectId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", projectId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  if (!projectId) return null;

  const roleBadgeColors: Record<string, string> = {
    owner: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    editor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    viewer: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  };

  return (
    <div className="p-3 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        Members
      </h3>

      {isLoading ? (
        <p className="text-xs text-gray-500">Loading...</p>
      ) : members.length === 0 ? (
        <p className="text-xs text-gray-500 italic">
          No members (open mode or single-user)
        </p>
      ) : (
        <div className="space-y-1.5">
          {members.map((m: ProjectMember) => (
            <div
              key={m.user_id}
              className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-800 rounded px-2 py-1.5"
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">
                  {m.display_name}
                </span>
                <span className="text-gray-500 truncate block">{m.email}</span>
              </div>
              <div className="flex items-center gap-1.5 ml-2">
                {isOwner ? (
                  <select
                    value={m.role}
                    onChange={(e) =>
                      updateRoleMutation.mutate({
                        userId: m.user_id,
                        role: e.target.value,
                      })
                    }
                    className="text-xs border rounded px-1 py-0.5 bg-white dark:bg-gray-700 dark:border-gray-600"
                  >
                    <option value="owner">Owner</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      roleBadgeColors[m.role] || ""
                    }`}
                  >
                    {m.role}
                  </span>
                )}
                {isOwner && (
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${m.display_name} from this project?`)) {
                        removeMutation.mutate(m.user_id);
                      }
                    }}
                    className="text-red-500 hover:text-red-700 text-xs"
                    title="Remove member"
                  >
                    x
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isOwner && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Add member
          </p>
          <div className="flex gap-1.5">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              className="flex-1 text-xs border rounded px-2 py-1 bg-white dark:bg-gray-700 dark:border-gray-600"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as ProjectRole)}
              className="text-xs border rounded px-1 py-1 bg-white dark:bg-gray-700 dark:border-gray-600"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
              <option value="owner">Owner</option>
            </select>
            <button
              onClick={() => {
                if (newEmail.trim()) {
                  addMutation.mutate({ email: newEmail.trim(), role: newRole });
                }
              }}
              disabled={addMutation.isPending || !newEmail.trim()}
              className="text-xs bg-blue-600 text-white rounded px-2 py-1 hover:bg-blue-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
      )}
    </div>
  );
}
