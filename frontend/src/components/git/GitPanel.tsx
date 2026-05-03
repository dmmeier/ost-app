"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { GitStatusResponse, GitCommitResponse, GitAuthor, GitCommitLog } from "@/lib/types";

interface GitPanelProps {
  projectId: string;
  treeId: string;
  treeName: string;
}

export function GitPanel({ projectId, treeId, treeName }: GitPanelProps) {
  // Settings state
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Author state
  const [authors, setAuthors] = useState<GitAuthor[]>([]);
  const [selectedAuthorIdx, setSelectedAuthorIdx] = useState<number | null>(null);
  const [showNewAuthor, setShowNewAuthor] = useState(false);
  const [newAuthorName, setNewAuthorName] = useState("");
  const [newAuthorEmail, setNewAuthorEmail] = useState("");

  // Commit state
  const [commitMessage, setCommitMessage] = useState(`Update ${treeName}`);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<GitCommitResponse | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  // History state
  const [history, setHistory] = useState<GitCommitLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Debounce timers
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const s = await api.git.status(projectId);
      setStatus(s);
      // Only set from status if fields are currently empty (initial load)
      if (s.remote_url && s.remote_url !== "***") {
        setRemoteUrl((prev) => prev || s.remote_url);
      }
      setBranch((prev) => prev || s.branch || "main");
    } catch {
      // ignore
    } finally {
      setSettingsLoading(false);
    }
  }, [projectId]);

  const fetchAuthors = useCallback(async () => {
    try {
      const a = await api.git.authors(projectId);
      setAuthors(a);
    } catch {
      // ignore
    }
  }, [projectId]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const h = await api.git.history(projectId, 50);
      setHistory(h);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

  // Load data on mount / project change
  useEffect(() => {
    fetchStatus();
    fetchAuthors();
    fetchHistory();
  }, [fetchStatus, fetchAuthors, fetchHistory]);

  // Reset commit message when tree changes
  useEffect(() => {
    setCommitMessage(`Update ${treeName}`);
    setCommitResult(null);
    setCommitError(null);
  }, [treeName]);

  // Load project's actual git config on project change (only overwrite if project has explicit values)
  useEffect(() => {
    (async () => {
      try {
        const project = await api.projects.get(projectId);
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
  }, [projectId]);

  // Debounced auto-save for settings
  const saveConfig = useCallback(
    (url: string, br: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          const updated = await api.git.updateConfig(projectId, {
            remote_url: url,
            branch: br,
          });
          setStatus(updated);
        } catch {
          // ignore
        }
      }, 800);
    },
    [projectId]
  );

  const handleRemoteChange = (val: string) => {
    setRemoteUrl(val);
    saveConfig(val, branch);
  };

  const handleBranchChange = (val: string) => {
    setBranch(val);
    saveConfig(remoteUrl, val);
  };

  // Author resolution: use new author fields when showNewAuthor OR when no authors exist
  const useNewAuthorFields = showNewAuthor || authors.length === 0;
  const resolvedAuthorName =
    useNewAuthorFields
      ? newAuthorName
      : selectedAuthorIdx !== null && authors[selectedAuthorIdx]
      ? authors[selectedAuthorIdx].name
      : "";
  const resolvedAuthorEmail =
    useNewAuthorFields
      ? newAuthorEmail
      : selectedAuthorIdx !== null && authors[selectedAuthorIdx]
      ? authors[selectedAuthorIdx].email
      : "";

  const handleCommit = async () => {
    setCommitting(true);
    setCommitError(null);
    setCommitResult(null);
    try {
      const r = await api.git.commit(
        treeId,
        commitMessage,
        resolvedAuthorName,
        resolvedAuthorEmail
      );
      setCommitResult(r);
      // Refresh history and authors after commit
      fetchHistory();
      fetchAuthors();
    } catch (err: any) {
      setCommitError(err.message || "Git commit failed");
    } finally {
      setCommitting(false);
    }
  };

  const canCommit =
    commitMessage.trim() &&
    resolvedAuthorName.trim() &&
    resolvedAuthorEmail.trim() &&
    !committing;

  return (
    <div className="p-4 space-y-5 text-sm max-w-3xl">
      <p className="text-xs text-gray-400">
        Export tree data as JSON and push it to a remote Git repository.
      </p>
      {/* ── Settings Section ─────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold uppercase text-gray-400 mb-2">Settings</h3>
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-gray-600">Remote URL</label>
            <input
              className="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
              placeholder="https://github.com/org/repo.git"
              value={remoteUrl}
              onChange={(e) => handleRemoteChange(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Branch</label>
            <input
              className="w-full border rounded px-2 py-1.5 text-sm mt-0.5"
              placeholder="main"
              value={branch}
              onChange={(e) => handleBranchChange(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 text-xs mt-1">
            <span className="text-gray-500">Token:</span>
            {status?.token_configured ? (
              <span className="text-green-600 font-medium">configured</span>
            ) : (
              <span className="text-gray-500">
                not set — if your remote requires token auth, add{" "}
                <code className="bg-gray-100 px-1 rounded">GIT_TOKEN</code> to{" "}
                <code className="bg-gray-100 px-1 rounded">.env</code>
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── Author Section ───────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold uppercase text-gray-400 mb-2">Author</h3>
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
      </section>

      {/* ── Commit Section ───────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold uppercase text-gray-400 mb-2">Commit</h3>
        <div className="space-y-2">
          <textarea
            className="w-full border rounded px-2 py-1.5 text-sm resize-y"
            rows={2}
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Describe the changes..."
            disabled={committing}
          />

          {/* Validation hints */}
          {!resolvedAuthorName.trim() && !resolvedAuthorEmail.trim() && (
            <div className="text-xs text-amber-600">Select or add an author before committing.</div>
          )}

          {/* Error display */}
          {commitError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
              {commitError}
              {commitError.toLowerCase().includes("authentication") && (
                <div className="mt-1 text-xs text-red-600">
                  Set <code className="bg-red-100 px-1 rounded">GIT_TOKEN</code> in your{" "}
                  <code className="bg-red-100 px-1 rounded">.env</code> file for HTTPS authentication.
                </div>
              )}
            </div>
          )}

          {/* Success display */}
          {commitResult && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3 space-y-1">
              {commitResult.no_changes ? (
                <div>No changes — tree JSON is already up to date.</div>
              ) : (
                <>
                  <div>Committed and pushed!</div>
                  <div className="text-xs text-green-600">
                    SHA: <code>{commitResult.commit_sha.slice(0, 12)}</code>
                  </div>
                </>
              )}
              <div className="text-xs text-green-600">
                File: <code>{commitResult.file_path}</code>
              </div>
            </div>
          )}

          <button
            onClick={handleCommit}
            disabled={!canCommit}
            className={`w-full py-2 rounded text-sm font-medium transition-colors ${
              canCommit
                ? "bg-[#0d9488] text-white hover:bg-[#0b7a70]"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {committing ? "Committing..." : "Commit & Push"}
          </button>
        </div>
      </section>

      {/* ── History Section ──────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold uppercase text-gray-400 mb-2">History</h3>
        {historyLoading ? (
          <div className="text-xs text-gray-400">Loading...</div>
        ) : history.length === 0 ? (
          <div className="text-xs text-gray-400">No commits yet.</div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {history.map((log) => (
              <div
                key={log.id}
                className="border rounded px-3 py-2 text-xs bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800 truncate flex-1">
                    {log.commit_message}
                  </span>
                  <span className="text-gray-400 ml-2 shrink-0">
                    {_relativeTime(log.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-gray-500">
                  <span>
                    {log.author_name} &lt;{log.author_email}&gt;
                  </span>
                  <code className="text-gray-400">{log.commit_sha.slice(0, 8)}</code>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function _relativeTime(isoStr: string): string {
  const now = Date.now();
  const then = new Date(isoStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(isoStr).toLocaleDateString();
}
