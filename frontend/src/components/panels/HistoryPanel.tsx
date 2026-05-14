"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { TreeSnapshot, TreeWithNodes, GitCommitLog, GitStatusResponse, GitAuthor, GitCommitResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { SnapshotDiffViewer } from "./SnapshotDiffViewer";
import { useAuthStore } from "@/stores/auth-store";
import { useCanEdit } from "@/hooks/use-permissions";
import { Database, GitBranch, ChevronDown, RotateCcw } from "lucide-react";

/* ── Design tokens ──────────────────────────────────────── */
const T = {
  bgSubtle: "#f6f5f1",
  bgInput: "#fbfaf7",
  border: "#e5e3dd",
  text: "#1f1d1a",
  textMuted: "#6f6a62",
  textFaint: "#9a948a",
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

/* ── Inline spinner for save buttons ───────────────────── */
function Spinner({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2.5" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

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
    <div className="overflow-y-auto h-full flex justify-center">
      <div style={{ width: "100%", maxWidth: 620, padding: "20px 28px 28px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ─── 1. Git Settings Accordion ──────────────── */}
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, background: T.bgSubtle, overflow: "hidden" }}>
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="w-full"
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px", background: "transparent", border: 0, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <ChevronDown
              size={12}
              color={T.textMuted}
              style={{
                transition: "transform 150ms ease",
                transform: settingsOpen ? "rotate(180deg)" : "rotate(0deg)",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.textMuted }}>
              Git Settings
            </span>
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 500, color: T.textFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {[repoShortName, branch, currentAuthorInitial].filter(Boolean).join(" · ")}
            </span>
          </button>

          {settingsOpen && (
            <div style={{ padding: "4px 14px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 12px", borderTop: `1px solid ${T.border}` }}>
              {/* Remote URL — full width */}
              <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 500 }}>Remote URL</span>
                <input
                  style={{
                    background: "#ffffff", border: `1px solid ${T.border}`, borderRadius: 6,
                    padding: "6px 9px", fontSize: 12.5,
                    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
                    color: T.text, outline: "none", width: "100%", boxSizing: "border-box",
                  }}
                  placeholder="https://github.com/org/repo.git"
                  value={remoteUrl}
                  onChange={(e) => handleRemoteChange(e.target.value)}
                />
              </div>

              {/* Branch */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 500 }}>Branch</span>
                <input
                  style={{
                    background: "#ffffff", border: `1px solid ${T.border}`, borderRadius: 6,
                    padding: "6px 9px", fontSize: 12.5, color: T.text, outline: "none",
                    width: "100%", boxSizing: "border-box",
                  }}
                  placeholder="main"
                  value={branch}
                  onChange={(e) => handleBranchChange(e.target.value)}
                />
              </div>

              {/* Author */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 500 }}>Author</span>
                {authors.length > 0 && !showNewAuthor ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <select
                      style={{
                        background: "#ffffff", border: `1px solid ${T.border}`, borderRadius: 6,
                        padding: "6px 9px", fontSize: 12.5, color: T.text, outline: "none",
                        width: "100%", boxSizing: "border-box",
                      }}
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
                      style={{ fontSize: 11, color: T.brand, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                    >
                      + New author
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <input
                      style={{
                        background: "#ffffff", border: `1px solid ${T.border}`, borderRadius: 6,
                        padding: "6px 9px", fontSize: 12.5, color: T.text, outline: "none",
                        width: "100%", boxSizing: "border-box",
                      }}
                      placeholder="Name"
                      value={newAuthorName}
                      onChange={(e) => {
                        setNewAuthorName(e.target.value);
                        persistAuthor(e.target.value, newAuthorEmail);
                      }}
                    />
                    <input
                      style={{
                        background: "#ffffff", border: `1px solid ${T.border}`, borderRadius: 6,
                        padding: "6px 9px", fontSize: 12.5, color: T.text, outline: "none",
                        width: "100%", boxSizing: "border-box",
                      }}
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
                        style={{ fontSize: 11, color: T.textFaint, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                      >
                        Cancel — use existing author
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Token status */}
              <div style={{ gridColumn: "1 / -1", fontSize: 12, color: T.textMuted }}>
                Token:{" "}
                {gitStatus?.token_configured ? (
                  <span style={{ color: T.brand, fontWeight: 500 }}>configured</span>
                ) : (
                  <span>
                    <span style={{ background: T.bgInput, padding: "1px 6px", borderRadius: 4, fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace", fontSize: 11 }}>not set</span>
                    {" — add "}
                    <span style={{ fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace", fontSize: 11 }}>GIT_TOKEN</span>
                    {" to "}
                    <span style={{ fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace", fontSize: 11 }}>.env</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── 2. Save Row (textarea + buttons) ──────── */}
        {canEdit && (
          <div>
            <textarea
              placeholder="Describe this version…"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              rows={2}
              style={{
                width: "100%", boxSizing: "border-box", resize: "vertical",
                border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px",
                fontFamily: "inherit", fontSize: 13.5, background: T.bgInput, color: T.text, outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
              {/* Save snapshot button */}
              <button
                onClick={handleSaveSnapshot}
                disabled={!commitMessage.trim() || isBusy}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "8px 14px", borderRadius: 8,
                  background: "#fff", border: `1px solid ${T.brand}`, color: T.brand,
                  cursor: !commitMessage.trim() || isBusy ? "not-allowed" : "pointer",
                  fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                  opacity: !commitMessage.trim() || isBusy ? 0.5 : 1,
                  transition: "background 150ms ease",
                }}
                onMouseEnter={(e) => {
                  if (commitMessage.trim() && !isBusy) {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(21,163,127,0.06)";
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#fff";
                }}
              >
                {isSaving ? <Spinner color={T.brand} /> : <Database size={14} strokeWidth={2} />}
                Save snapshot
              </button>

              {/* Commit button */}
              <button
                onClick={handleGitCommit}
                disabled={!commitMessage.trim() || isBusy || !gitConfigured}
                title={!gitConfigured ? "Configure Git in settings above" : `Commit & push to ${branch}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "8px 14px", borderRadius: 8,
                  background: "#fff", border: `1px solid ${T.commit}`, color: T.commit,
                  cursor: !commitMessage.trim() || isBusy || !gitConfigured ? "not-allowed" : "pointer",
                  fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                  opacity: !commitMessage.trim() || isBusy || !gitConfigured ? 0.5 : 1,
                  transition: "background 150ms ease",
                }}
                onMouseEnter={(e) => {
                  if (commitMessage.trim() && !isBusy && gitConfigured) {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(182,90,24,0.06)";
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#fff";
                }}
              >
                {committing ? <Spinner color={T.commit} /> : <GitBranch size={14} strokeWidth={2} />}
                Commit to{" "}
                <span style={{ fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace", fontWeight: 600 }}>
                  {branch}
                </span>
              </button>
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
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.textMuted, marginBottom: 10 }}>
            History
          </div>
          {isLoading ? (
            <p className="text-xs" style={{ color: T.textFaint }}>Loading...</p>
          ) : displayedEntries.length === 0 ? (
            <div style={{ background: T.bgSubtle, border: `1px dashed ${T.border}`, borderRadius: 10, padding: 16, textAlign: "center", fontSize: 13, color: T.textFaint }}>
              No history yet. Save a snapshot or make a git commit to get started.
            </div>
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
              {/* Vertical rail behind markers */}
              <div style={{ position: "absolute", left: 11, top: 14, bottom: 14, width: 1.5, background: T.border }} />

              {/* Current state row */}
              <li style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ position: "relative", zIndex: 1, background: "#fff", padding: "2px 0", flexShrink: 0 }}>
                  <EntryGlyph kind="current" />
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: T.brand, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Current state
                </span>
                <span style={{ fontSize: 12, color: T.textFaint, flexShrink: 0 }}>now</span>
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
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "8px 0", position: "relative",
                        borderBottom: isLast ? "none" : `1px solid ${T.border}`,
                        cursor: "pointer",
                        transition: "background 100ms ease",
                        borderRadius: 4,
                        background: selectedSnapshotId === snap.id ? "rgba(21,163,127,0.06)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (selectedSnapshotId !== snap.id) {
                          (e.currentTarget as HTMLLIElement).style.background = T.bgInput;
                        }
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLLIElement).style.background =
                          selectedSnapshotId === snap.id ? "rgba(21,163,127,0.06)" : "transparent";
                      }}
                    >
                      <span style={{ position: "relative", zIndex: 1, background: "#fff", padding: "2px 0", flexShrink: 0 }}>
                        <EntryGlyph kind="snapshot" />
                      </span>
                      <span
                        style={{
                          flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500, color: T.text,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                        title={snap.message}
                      >
                        {snap.message}
                      </span>
                      <span style={{ fontSize: 12, color: T.textFaint, flexShrink: 0, cursor: "help" }} title={absoluteTime(snap.created_at)}>
                        {relativeTime(snap.created_at)}
                      </span>
                      {canEdit && (
                        <>
                          {confirmRestoreId === snap.id ? (
                            <span
                              className="flex items-center gap-1 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span style={{ fontSize: 10, color: T.commit }}>Restore?</span>
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
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmRestoreId(snap.id);
                              }}
                              style={{
                                padding: "3px 8px", borderRadius: 6, border: `1px solid ${T.border}`,
                                background: "#fff", color: T.textMuted, cursor: "pointer",
                                fontFamily: "inherit", fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 4,
                                flexShrink: 0,
                              }}
                            >
                              <RotateCcw size={11} /> Restore
                            </button>
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
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "8px 0", position: "relative",
                        borderBottom: isLast ? "none" : `1px solid ${T.border}`,
                        transition: "background 100ms ease",
                        borderRadius: 4,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLLIElement).style.background = T.bgInput;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLLIElement).style.background = "transparent";
                      }}
                    >
                      <span style={{ position: "relative", zIndex: 1, background: "#fff", padding: "2px 0", flexShrink: 0 }}>
                        <EntryGlyph kind="commit" />
                      </span>
                      <span
                        style={{
                          flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500, color: T.text,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                        title={commit.commit_message}
                      >
                        {commit.commit_message}
                        <span style={{ marginLeft: 8, fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace", fontSize: 11.5, color: T.textFaint }}>
                          {commit.commit_sha.slice(0, 8)}
                        </span>
                        <span style={{
                          marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 4,
                          background: T.commitSoft, color: T.commit,
                          padding: "1px 7px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                          verticalAlign: "middle",
                        }}>
                          <GitBranch size={10} strokeWidth={2} />{commit.branch}
                        </span>
                      </span>
                      <span style={{ fontSize: 12, color: T.textFaint, flexShrink: 0, cursor: "help" }} title={absoluteTime(commit.created_at)}>
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
