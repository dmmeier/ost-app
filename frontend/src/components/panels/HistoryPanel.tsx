"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { TreeSnapshot, TreeWithNodes, GitCommitLog, GitStatusResponse, GitAuthor, GitCommitResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SnapshotDiffViewer } from "./SnapshotDiffViewer";
import { useAuthStore } from "@/stores/auth-store";
import { useCanEdit } from "@/hooks/use-permissions";

interface HistoryPanelProps {
  tree: TreeWithNodes;
}

/** Ensure a timestamp string is parsed as UTC (backend stores UTC without Z suffix). */
function parseUTC(dateStr: string): Date {
  const s = dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z";
  return new Date(s);
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = parseUTC(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  const remainMin = diffMin % 60;
  if (diffHr < 24) return remainMin > 0 ? `${diffHr}h ${remainMin}m ago` : `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return parseUTC(dateStr).toLocaleDateString();
}

function absoluteTime(dateStr: string): string {
  return parseUTC(dateStr).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

type TimelineEntry =
  | { type: "snapshot"; data: TreeSnapshot }
  | { type: "git_commit"; data: GitCommitLog };

export function HistoryPanel({ tree }: HistoryPanelProps) {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const authUser = useAuthStore((s) => s.user);

  // Snapshot state
  const [snapshots, setSnapshots] = useState<TreeSnapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  // Git state
  const [gitHistory, setGitHistory] = useState<GitCommitLog[]>([]);
  const [gitHistoryLoading, setGitHistoryLoading] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<GitCommitResponse | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Git settings state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [authors, setAuthors] = useState<GitAuthor[]>([]);
  const [selectedAuthorIdx, setSelectedAuthorIdx] = useState<number | null>(null);
  const [showNewAuthor, setShowNewAuthor] = useState(false);
  const [newAuthorName, setNewAuthorName] = useState("");
  const [newAuthorEmail, setNewAuthorEmail] = useState("");

  // Shared commit message
  const [commitMessage, setCommitMessage] = useState("");

  // Debounce timer for settings auto-save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data fetching ─────────────────────────────────────

  const loadSnapshots = useCallback(async () => {
    setSnapshotsLoading(true);
    try {
      const data = await api.snapshots.list(tree.id);
      setSnapshots(data);
    } catch (err) {
      console.error("Failed to load snapshots:", err);
    } finally {
      setSnapshotsLoading(false);
    }
  }, [tree.id]);

  const fetchGitHistory = useCallback(async () => {
    setGitHistoryLoading(true);
    try {
      const h = await api.git.history(tree.project_id, 50);
      setGitHistory(h);
    } catch {
      // ignore
    } finally {
      setGitHistoryLoading(false);
    }
  }, [tree.project_id]);

  const fetchGitStatus = useCallback(async () => {
    try {
      const s = await api.git.status(tree.project_id);
      setGitStatus(s);
      if (s.remote_url && s.remote_url !== "***") {
        setRemoteUrl((prev) => prev || s.remote_url);
      }
      setBranch((prev) => prev || s.branch || "main");
    } catch {
      // ignore
    }
  }, [tree.project_id]);

  const fetchAuthors = useCallback(async () => {
    try {
      const a = await api.git.authors(tree.project_id);
      setAuthors(a);
    } catch {
      // ignore
    }
  }, [tree.project_id]);

  // Load data on mount / tree change
  useEffect(() => {
    loadSnapshots();
    setSelectedSnapshotId(null);
    setCommitResult(null);
    setCommitError(null);
    setCommitMessage("");
  }, [tree.id, loadSnapshots]);

  useEffect(() => {
    fetchGitStatus();
    fetchAuthors();
    fetchGitHistory();
  }, [fetchGitStatus, fetchAuthors, fetchGitHistory]);

  // Load project's actual git config on project change
  useEffect(() => {
    (async () => {
      try {
        const project = await api.projects.get(tree.project_id);
        if (project.git_remote_url) {
          setRemoteUrl(project.git_remote_url);
        }
        if (project.git_branch) {
          setBranch(project.git_branch);
        }
      } catch {
        // ignore
      }
    })();
  }, [tree.project_id]);

  // Pre-fill author from authenticated user
  useEffect(() => {
    if (authUser && !newAuthorName && !newAuthorEmail) {
      setNewAuthorName(authUser.display_name);
      setNewAuthorEmail(authUser.email);
    }
  }, [authUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────

  const handleSaveSnapshot = async () => {
    if (!commitMessage.trim()) return;
    setIsSaving(true);
    try {
      await api.snapshots.create(tree.id, commitMessage.trim());
      setCommitMessage("");
      loadSnapshots();
    } catch (err) {
      console.error("Failed to create snapshot:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGitCommit = async () => {
    if (!commitMessage.trim()) return;
    setCommitting(true);
    setCommitError(null);
    setCommitResult(null);

    // Author resolution
    const useNewAuthorFields = showNewAuthor || authors.length === 0;
    const authorName = useNewAuthorFields
      ? newAuthorName
      : selectedAuthorIdx !== null && authors[selectedAuthorIdx]
      ? authors[selectedAuthorIdx].name
      : "";
    const authorEmail = useNewAuthorFields
      ? newAuthorEmail
      : selectedAuthorIdx !== null && authors[selectedAuthorIdx]
      ? authors[selectedAuthorIdx].email
      : "";

    if (!authorName.trim() || !authorEmail.trim()) {
      setCommitError("Configure an author in Git Settings before committing.");
      setCommitting(false);
      return;
    }

    try {
      const r = await api.git.commit(tree.id, commitMessage.trim(), authorName, authorEmail);
      setCommitResult(r);
      setCommitMessage("");
      fetchGitHistory();
      fetchAuthors();
    } catch (err: any) {
      setCommitError(err.message || "Git commit failed");
    } finally {
      setCommitting(false);
    }
  };

  const handleRestore = async (snapshotId: string) => {
    setIsRestoring(true);
    try {
      await api.snapshots.restore(tree.id, snapshotId);
      setConfirmRestoreId(null);
      setSelectedSnapshotId(null);
      queryClient.invalidateQueries({ queryKey: ["tree", tree.id] });
      loadSnapshots();
    } catch (err) {
      console.error("Failed to restore snapshot:", err);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSnapshotClick = (snapId: string) => {
    setSelectedSnapshotId((prev) => (prev === snapId ? null : snapId));
  };

  // Debounced auto-save for git settings
  const saveConfig = useCallback(
    (url: string, br: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          const updated = await api.git.updateConfig(tree.project_id, {
            remote_url: url,
            branch: br,
          });
          setGitStatus(updated);
        } catch {
          // ignore
        }
      }, 800);
    },
    [tree.project_id]
  );

  const handleRemoteChange = (val: string) => {
    setRemoteUrl(val);
    saveConfig(val, branch);
  };

  const handleBranchChange = (val: string) => {
    setBranch(val);
    saveConfig(remoteUrl, val);
  };

  // ── Computed values ───────────────────────────────────

  const gitConfigured = gitStatus?.configured ?? false;

  // Merge snapshots and git commits into unified timeline
  const timelineEntries: TimelineEntry[] = [
    ...snapshots.map((s): TimelineEntry => ({ type: "snapshot", data: s })),
    ...gitHistory.map((g): TimelineEntry => ({ type: "git_commit", data: g })),
  ].sort((a, b) => {
    const aTime = parseUTC(a.data.created_at).getTime();
    const bTime = parseUTC(b.data.created_at).getTime();
    return bTime - aTime; // descending
  });

  // For diff viewer: find the previous snapshot (not git commit) relative to selected
  const snapshotOnlyList = snapshots; // already sorted desc from API
  const selectedIndex = snapshotOnlyList.findIndex((s) => s.id === selectedSnapshotId);
  const selectedSnapshot = selectedIndex >= 0 ? snapshotOnlyList[selectedIndex] : undefined;
  const previousSnapshot =
    selectedIndex >= 0 && selectedIndex < snapshotOnlyList.length - 1
      ? snapshotOnlyList[selectedIndex + 1]
      : null;

  const isLoading = snapshotsLoading || gitHistoryLoading;

  // ── Render ────────────────────────────────────────────

  const timeline = (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      {/* Commit bar — hidden for viewers */}
      {canEdit && (
        <div>
          <div className="flex gap-2 items-center">
            <Input
              placeholder="Describe this version..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveSnapshot()}
              className="text-sm flex-1"
            />
            <Button
              size="sm"
              onClick={handleSaveSnapshot}
              disabled={!commitMessage.trim() || isSaving}
              className="text-xs shrink-0"
            >
              {isSaving ? "..." : "Save Snapshot"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleGitCommit}
              disabled={!commitMessage.trim() || committing || !gitConfigured}
              className="text-xs shrink-0"
              title={!gitConfigured ? "Configure Git in settings below" : "Commit & push to remote"}
            >
              {committing ? "..." : "Git Commit"}
            </Button>
          </div>

          {/* Inline feedback */}
          {commitResult && (
            <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md p-2 mt-2">
              {commitResult.no_changes ? (
                <span>No changes — tree JSON is already up to date.</span>
              ) : (
                <span>
                  Committed and pushed! SHA:{" "}
                  <code className="bg-green-100 px-1 rounded">{commitResult.commit_sha.slice(0, 12)}</code>
                </span>
              )}
            </div>
          )}
          {commitError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2 mt-2">
              {commitError}
              {commitError.toLowerCase().includes("authentication") && (
                <span className="block mt-1 text-red-600">
                  Set <code className="bg-red-100 px-1 rounded">GIT_TOKEN</code> in your{" "}
                  <code className="bg-red-100 px-1 rounded">.env</code> file.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Unified timeline */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
          History
        </p>
        {isLoading ? (
          <p className="text-xs text-gray-400">Loading...</p>
        ) : timelineEntries.length === 0 ? (
          <div className="bg-gray-50 border border-dashed rounded-md p-3 text-center text-xs text-gray-400">
            No history yet. Save a snapshot or make a git commit to get started.
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-200" />

            <div className="space-y-0">
              {/* Current state marker */}
              <div className="flex items-center gap-3 relative py-1.5">
                <div className="w-[14px] h-[14px] rounded-full bg-[#0d9488] border-2 border-white shadow-sm z-10 shrink-0" />
                <span className="text-xs font-medium text-[#0b7a70]">Current state</span>
                <span className="text-[10px] text-gray-400 ml-auto">now</span>
              </div>

              {/* Timeline entries */}
              {timelineEntries.map((entry) => {
                if (entry.type === "snapshot") {
                  const snap = entry.data;
                  return (
                    <div
                      key={`snap-${snap.id}`}
                      className={`flex items-center gap-2 relative py-1.5 border-b border-gray-100 last:border-0 cursor-pointer rounded transition-colors ${
                        selectedSnapshotId === snap.id
                          ? "bg-[#e6f4f3] border-[#0d9488]/30"
                          : "hover:bg-gray-50"
                      }`}
                      onClick={() => handleSnapshotClick(snap.id)}
                    >
                      {/* Amber dot for snapshot */}
                      <div
                        className={`w-[14px] h-[14px] rounded-full border-2 z-10 shrink-0 ${
                          selectedSnapshotId === snap.id
                            ? "bg-amber-500 border-amber-400/50"
                            : "bg-amber-100 border-amber-300"
                        }`}
                      />
                      <span
                        className={`text-xs font-medium truncate min-w-0 ${
                          selectedSnapshotId === snap.id ? "text-[#0b7a70]" : "text-gray-700"
                        }`}
                        style={{ maxWidth: selectedSnapshotId ? "120px" : "200px" }}
                        title={snap.message}
                      >
                        {snap.message}
                      </span>
                      {canEdit && (
                        <>
                          {confirmRestoreId === snap.id ? (
                            <span
                              className="flex items-center gap-1 ml-auto shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-[10px] text-amber-600">Restore?</span>
                              <Button
                                variant="default"
                                size="sm"
                                className="text-[10px] h-5 px-1.5"
                                disabled={isRestoring}
                                onClick={() => handleRestore(snap.id)}
                              >
                                {isRestoring ? "..." : "Yes"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-[10px] h-5 px-1.5"
                                onClick={() => setConfirmRestoreId(null)}
                              >
                                No
                              </Button>
                            </span>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[10px] h-5 px-1.5 text-[#0d9488] ml-auto shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmRestoreId(snap.id);
                              }}
                            >
                              Restore
                            </Button>
                          )}
                        </>
                      )}
                      <span
                        className="text-[10px] text-gray-400 shrink-0 cursor-help"
                        title={absoluteTime(snap.created_at)}
                      >
                        {relativeTime(snap.created_at)}
                      </span>
                    </div>
                  );
                } else {
                  const commit = entry.data;
                  return (
                    <div
                      key={`git-${commit.id}`}
                      className="flex items-center gap-2 relative py-1.5 border-b border-gray-100 last:border-0"
                    >
                      {/* Orange dot for git commit */}
                      <div className="w-[14px] h-[14px] rounded-full bg-orange-100 border-2 border-orange-300 z-10 shrink-0" />
                      <span
                        className="text-xs font-medium text-gray-700 truncate min-w-0"
                        style={{ maxWidth: "200px" }}
                        title={commit.commit_message}
                      >
                        {commit.commit_message}
                      </span>
                      <code className="text-[10px] text-gray-400 shrink-0">
                        {commit.commit_sha.slice(0, 8)}
                      </code>
                      <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full shrink-0">
                        {commit.branch}
                      </span>
                      <span
                        className="text-[10px] text-gray-400 ml-auto shrink-0 cursor-help"
                        title={absoluteTime(commit.created_at)}
                      >
                        {relativeTime(commit.created_at)}
                      </span>
                    </div>
                  );
                }
              })}
            </div>
          </div>
        )}
      </div>

      {/* Git Settings — collapsible */}
      <div className="border-t pt-2">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600 transition-colors w-full"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${settingsOpen ? "rotate-90" : ""}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          Git Settings
        </button>

        {settingsOpen && (
          <div className="mt-2 space-y-3 pl-1">
            {/* Remote URL */}
            <div>
              <label className="text-xs font-medium text-gray-600">Remote URL</label>
              <input
                className="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
                placeholder="https://github.com/org/repo.git"
                value={remoteUrl}
                onChange={(e) => handleRemoteChange(e.target.value)}
              />
            </div>
            {/* Branch */}
            <div>
              <label className="text-xs font-medium text-gray-600">Branch</label>
              <input
                className="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
                placeholder="main"
                value={branch}
                onChange={(e) => handleBranchChange(e.target.value)}
              />
            </div>
            {/* Token status */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Token:</span>
              {gitStatus?.token_configured ? (
                <span className="text-green-600 font-medium">configured</span>
              ) : (
                <span className="text-gray-500">
                  not set — add{" "}
                  <code className="bg-gray-100 px-1 rounded">GIT_TOKEN</code> to{" "}
                  <code className="bg-gray-100 px-1 rounded">.env</code>
                </span>
              )}
            </div>
            {/* Author */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Author</label>
              {authors.length > 0 && !showNewAuthor ? (
                <div className="space-y-2">
                  <select
                    className="w-full border rounded px-2 py-1.5 text-sm"
                    value={selectedAuthorIdx ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedAuthorIdx(val === "" ? null : parseInt(val));
                    }}
                  >
                    <option value="">Select an author...</option>
                    {authors.map((a, i) => (
                      <option key={`${a.email}-${i}`} value={i}>
                        {a.name} &lt;{a.email}&gt;
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      setShowNewAuthor(true);
                      setSelectedAuthorIdx(null);
                    }}
                    className="text-xs text-[#0d9488] hover:text-[#0b7a70] flex items-center gap-1"
                  >
                    <span className="text-base leading-none">+</span> New author
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    className="w-full border rounded px-2 py-1.5 text-sm"
                    placeholder="Name"
                    value={newAuthorName}
                    onChange={(e) => setNewAuthorName(e.target.value)}
                  />
                  <input
                    className="w-full border rounded px-2 py-1.5 text-sm"
                    placeholder="Email address"
                    type="email"
                    value={newAuthorEmail}
                    onChange={(e) => setNewAuthorEmail(e.target.value)}
                  />
                  {authors.length > 0 && (
                    <button
                      onClick={() => {
                        setShowNewAuthor(false);
                        setNewAuthorName("");
                        setNewAuthorEmail("");
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel — use existing author
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Diff viewer split layout when snapshot selected
  if (selectedSnapshotId && selectedSnapshot) {
    return (
      <div className="flex h-full">
        <div className="w-[35%] border-r overflow-hidden">{timeline}</div>
        <div className="w-[65%] overflow-hidden">
          <SnapshotDiffViewer
            treeId={tree.id}
            snapshotId={selectedSnapshotId}
            snapshotMessage={selectedSnapshot.message}
            previousSnapshotId={previousSnapshot?.id ?? null}
            previousSnapshotMessage={previousSnapshot?.message ?? null}
            onClose={() => setSelectedSnapshotId(null)}
          />
        </div>
      </div>
    );
  }

  return timeline;
}
