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
    owner: "bg-red-100 text-red-800",
    editor: "bg-green-100 text-green-800",
    viewer: "bg-blue-100 text-blue-800",
  };

  return (
    <div className="p-3 space-y-3">
      <h3 className="text-sm font-semibold text-ink">
        Members
      </h3>

      {isLoading ? (
        <p className="text-xs text-ost-muted">Loading...</p>
      ) : members.length === 0 ? (
        <p className="text-xs text-ost-muted italic">
          No members yet (single-user mode)
        </p>
      ) : (
        <div className="space-y-1.5">
          {members.map((m: ProjectMember) => (
            <div
              key={m.user_id}
              className="flex items-center justify-between text-xs bg-canvas rounded px-2 py-1.5"
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">
                  {m.display_name}
                </span>
                <span className="text-ost-muted truncate block">{m.email}</span>
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
                    className="text-xs border rounded px-1 py-0.5 bg-paper"
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
        <div className="border-t border-line pt-2 mt-2">
          <p className="text-xs font-medium text-ost-muted mb-1">
            Add member
          </p>
          <div className="flex gap-1.5">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              className="flex-1 text-xs border rounded px-2 py-1 bg-paper"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as ProjectRole)}
              className="text-xs border rounded px-1 py-1 bg-paper"
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
