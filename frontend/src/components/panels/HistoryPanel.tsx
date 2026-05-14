"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { TreeSnapshot, TreeWithNodes, GitCommitLog, GitStatusResponse, GitAuthor, GitCommitResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SnapshotDiffViewer } from "./SnapshotDiffViewer";
import { useAuthStore } from "@/stores/auth-store";
import { useCanEdit } from "@/hooks/use-permissions";
import { Database, GitBranch, ChevronDown, RotateCcw, Loader2 } from "lucide-react";

/* ── Design tokens (used by EntryGlyph markers + rail) ─── */
const T = {
  border: "#e5e3dd",
  brand: "#15a37f",
  snapSoft: "#d8efe6",
  commit: "#b65a18",
  commitSoft: "#fbe6d3",
} as const;

/* ── localStorage key for author persistence ───────────── */
const AUTHOR_STORAGE_KEY = "ost_git_author";

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

/* ── Entry glyph markers (22px) ────────────────────────── */
function EntryGlyph({ kind }: { kind: "current" | "snapshot" | "commit" }) {
  if (kind === "current") {
    return (
      <span
        className="inline-flex items-center justify-center shrink-0"
        style={{
          width: 22, height: 22, borderRadius: 999,
          background: T.brand,
          boxShadow: `0 0 0 4px ${T.snapSoft}`,
          position: "relative", zIndex: 1,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 999, background: "#fff" }} />
      </span>
    );
  }
  if (kind === "snapshot") {
    return (
      <span
        className="inline-flex items-center justify-center shrink-0"
        style={{
          width: 22, height: 22, borderRadius: 999,
          background: T.snapSoft,
          border: `1.5px solid ${T.brand}`,
          position: "relative", zIndex: 1,
          boxSizing: "border-box",
        }}
      >
        <Database size={11} color={T.brand} strokeWidth={2} />
      </span>
    );
  }
  // commit
  return (
    <span
      className="inline-flex items-center justify-center shrink-0"
      style={{
        width: 22, height: 22, borderRadius: 999,
        background: T.commitSoft,
        border: `1.5px solid ${T.commit}`,
        position: "relative", zIndex: 1,
        boxSizing: "border-box",
      }}
    >
      <GitBranch size={11} color={T.commit} strokeWidth={2} />
    </span>
  );
}

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

  // Author persistence via localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTHOR_STORAGE_KEY);
      if (stored) {
        const { name, email } = JSON.parse(stored);
        if (name) setNewAuthorName(name);
        if (email) setNewAuthorEmail(email);
      } else if (authUser) {
        setNewAuthorName(authUser.display_name);
        setNewAuthorEmail(authUser.email);
      }
    } catch {
      if (authUser) {
        setNewAuthorName(authUser.display_name);
        setNewAuthorEmail(authUser.email);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Match stored author against fetched authors list
  useEffect(() => {
    if (authors.length === 0) return;
    try {
      const stored = localStorage.getItem(AUTHOR_STORAGE_KEY);
      if (stored) {
        const { name, email } = JSON.parse(stored);
        const idx = authors.findIndex(
          (a) => a.name === name && a.email === email
        );
        if (idx >= 0) {
          setSelectedAuthorIdx(idx);
          setShowNewAuthor(false);
        } else if (name || email) {
          setNewAuthorName(name || "");
          setNewAuthorEmail(email || "");
          setShowNewAuthor(true);
        }
      }
    } catch {
      // ignore
    }
  }, [authors]);

  // Persist author to localStorage on change
  const persistAuthor = useCallback((name: string, email: string) => {
    try {
      localStorage.setItem(AUTHOR_STORAGE_KEY, JSON.stringify({ name, email }));
    } catch {
      // ignore
    }
  }, []);

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

    // Persist author on commit
    persistAuthor(authorName, authorEmail);

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

  // Limit to 10 entries (current state is rendered separately)
  const displayedEntries = timelineEntries.slice(0, 10);

  // For diff viewer: find the previous snapshot (not git commit) relative to selected
  const snapshotOnlyList = snapshots; // already sorted desc from API
  const selectedIndex = snapshotOnlyList.findIndex((s) => s.id === selectedSnapshotId);
  const selectedSnapshot = selectedIndex >= 0 ? snapshotOnlyList[selectedIndex] : undefined;
  const previousSnapshot =
    selectedIndex >= 0 && selectedIndex < snapshotOnlyList.length - 1
      ? snapshotOnlyList[selectedIndex + 1]
      : null;

  const isLoading = snapshotsLoading || gitHistoryLoading;
  const isBusy = isSaving || committing;

  // Status summary for collapsed accordion
  const repoShortName = remoteUrl
    ? remoteUrl.replace(/^https?:\/\/[^/]+\//, "").replace(/\.git$/, "")
    : "";
  const currentAuthorInitial = (() => {
    const useNew = showNewAuthor || authors.length === 0;
    const name = useNew
      ? newAuthorName
      : selectedAuthorIdx !== null && authors[selectedAuthorIdx]
      ? authors[selectedAuthorIdx].name
      : "";
    return name ? name.charAt(0).toUpperCase() : "";
  })();

  // ── Render ────────────────────────────────────────────

  const timeline = (
    <div className="p-3 space-y-3 overflow-y-auto h-full">

        {/* ─── 1. Git Settings Accordion ──────────────── */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="flex items-center gap-2 w-full px-3 py-2 bg-transparent border-0 cursor-pointer"
          >
            <ChevronDown
              size={12}
              className="text-gray-400 shrink-0 transition-transform duration-150"
              style={{ transform: settingsOpen ? "rotate(180deg)" : "rotate(0deg)" }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Git Settings
            </span>
            <span className="ml-auto text-[10px] text-gray-400 truncate">
              {[repoShortName, branch, currentAuthorInitial].filter(Boolean).join(" · ")}
            </span>
          </button>

          {settingsOpen && (
            <div className="grid grid-cols-2 gap-2.5 gap-x-3 px-3 pb-3 pt-1 border-t border-gray-200">
              {/* Remote URL — full width */}
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-[10px] font-medium text-gray-500">Remote URL</label>
                <input
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-[#0d9488]"
                  placeholder="https://github.com/org/repo.git"
                  value={remoteUrl}
                  onChange={(e) => handleRemoteChange(e.target.value)}
                />
              </div>

              {/* Branch */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-gray-500">Branch</label>
                <input
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#0d9488]"
                  placeholder="main"
                  value={branch}
                  onChange={(e) => handleBranchChange(e.target.value)}
                />
              </div>

              {/* Author */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-gray-500">Author</label>
                {authors.length > 0 && !showNewAuthor ? (
                  <div className="flex flex-col gap-1.5">
                    <select
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#0d9488]"
                      value={selectedAuthorIdx ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        const idx = val === "" ? null : parseInt(val);
                        setSelectedAuthorIdx(idx);
                        if (idx !== null && authors[idx]) {
                          persistAuthor(authors[idx].name, authors[idx].email);
                        }
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
                      className="text-[10px] text-[#0d9488] hover:text-[#0b7a70] text-left p-0 bg-transparent border-0 cursor-pointer"
                    >
                      + New author
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <input
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#0d9488]"
                      placeholder="Name"
                      value={newAuthorName}
                      onChange={(e) => {
                        setNewAuthorName(e.target.value);
                        persistAuthor(e.target.value, newAuthorEmail);
                      }}
                    />
                    <input
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#0d9488]"
                      placeholder="Email address"
                      type="email"
                      value={newAuthorEmail}
                      onChange={(e) => {
                        setNewAuthorEmail(e.target.value);
                        persistAuthor(newAuthorName, e.target.value);
                      }}
                    />
                    {authors.length > 0 && (
                      <button
                        onClick={() => {
                          setShowNewAuthor(false);
                          setNewAuthorName("");
                          setNewAuthorEmail("");
                        }}
                        className="text-[10px] text-gray-500 hover:text-gray-700 text-left p-0 bg-transparent border-0 cursor-pointer"
                      >
                        Cancel — use existing author
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Token status */}
              <div className="col-span-2 text-xs text-gray-500">
                Token:{" "}
                {gitStatus?.token_configured ? (
                  <span className="text-green-600 font-medium">configured</span>
                ) : (
                  <span>
                    not set — add{" "}
                    <code className="bg-gray-100 px-1 rounded text-[10px]">GIT_TOKEN</code> to{" "}
                    <code className="bg-gray-100 px-1 rounded text-[10px]">.env</code>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── 2. Save Row (textarea + buttons) ──────── */}
        {canEdit && (
          <div>
            <Textarea
              placeholder="Describe this version…"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              rows={2}
              className="text-sm resize-y min-h-[60px]"
            />
            <div className="flex gap-2 mt-2 justify-end">
              {/* Save snapshot button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveSnapshot}
                disabled={!commitMessage.trim() || isBusy}
                className="text-[#15a37f] border-[#15a37f] hover:bg-[#15a37f]/5 text-xs"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                Save snapshot
              </Button>

              {/* Commit button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleGitCommit}
                disabled={!commitMessage.trim() || isBusy || !gitConfigured}
                title={!gitConfigured ? "Configure Git in settings above" : `Commit & push to ${branch}`}
                className="text-[#b65a18] border-[#b65a18] hover:bg-[#b65a18]/5 text-xs"
              >
                {committing ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
                Commit to{" "}
                <span className="font-mono font-semibold">{branch}</span>
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

        {/* ─── 3. History List ───────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
            History
          </p>
          {isLoading ? (
            <p className="text-xs text-gray-400">Loading...</p>
          ) : displayedEntries.length === 0 ? (
            <div className="bg-gray-50 border border-dashed rounded-md p-3 text-center text-xs text-gray-400">
              No history yet. Save a snapshot or make a git commit to get started.
            </div>
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
              {/* Vertical rail behind markers */}
              <div style={{ position: "absolute", left: 11, top: 14, bottom: 14, width: 1.5, background: T.border }} />

              {/* Current state row */}
              <li className="flex items-center gap-3 py-1.5 border-b border-gray-100">
                <span className="relative z-10 bg-white py-0.5 shrink-0">
                  <EntryGlyph kind="current" />
                </span>
                <span className="flex-1 min-w-0 text-xs font-semibold text-[#0d9488] truncate">
                  Current state
                </span>
                <span className="text-[10px] text-gray-400 shrink-0">now</span>
              </li>

              {/* Timeline entries */}
              {displayedEntries.map((entry, idx) => {
                const isLast = idx === displayedEntries.length - 1;

                if (entry.type === "snapshot") {
                  const snap = entry.data;
                  return (
                    <li
                      key={`snap-${snap.id}`}
                      onClick={() => handleSnapshotClick(snap.id)}
                      className={`flex items-center gap-3 py-1.5 relative cursor-pointer transition-colors rounded ${
                        isLast ? "" : "border-b border-gray-100"
                      } ${
                        selectedSnapshotId === snap.id
                          ? "bg-[#e6f4f3]"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <span className="relative z-10 bg-white py-0.5 shrink-0">
                        <EntryGlyph kind="snapshot" />
                      </span>
                      <span
                        className="flex-1 min-w-0 text-xs font-medium text-gray-700 truncate"
                        title={snap.message}
                      >
                        {snap.message}
                      </span>
                      <span
                        className="text-[10px] text-gray-400 shrink-0 cursor-help"
                        title={absoluteTime(snap.created_at)}
                      >
                        {relativeTime(snap.created_at)}
                      </span>
                      {canEdit && (
                        <>
                          {confirmRestoreId === snap.id ? (
                            <span
                              className="flex items-center gap-1 shrink-0"
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
                              variant="outline"
                              size="xs"
                              className="text-[10px] shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmRestoreId(snap.id);
                              }}
                            >
                              <RotateCcw size={11} /> Restore
                            </Button>
                          )}
                        </>
                      )}
                    </li>
                  );
                } else {
                  const commit = entry.data;
                  return (
                    <li
                      key={`git-${commit.id}`}
                      className={`flex items-center gap-3 py-1.5 relative transition-colors rounded hover:bg-gray-50 ${
                        isLast ? "" : "border-b border-gray-100"
                      }`}
                    >
                      <span className="relative z-10 bg-white py-0.5 shrink-0">
                        <EntryGlyph kind="commit" />
                      </span>
                      <span
                        className="flex-1 min-w-0 text-xs font-medium text-gray-700 truncate"
                        title={commit.commit_message}
                      >
                        {commit.commit_message}
                        <code className="ml-2 text-[10px] text-gray-400">
                          {commit.commit_sha.slice(0, 8)}
                        </code>
                        <span className="ml-2 inline-flex items-center gap-1 bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full text-[9px] font-semibold align-middle">
                          <GitBranch size={10} strokeWidth={2} />{commit.branch}
                        </span>
                      </span>
                      <span
                        className="text-[10px] text-gray-400 shrink-0 cursor-help"
                        title={absoluteTime(commit.created_at)}
                      >
                        {relativeTime(commit.created_at)}
                      </span>
                    </li>
                  );
                }
              })}
            </ol>
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
