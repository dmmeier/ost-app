"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { GitStatusResponse, GitCommitResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface GitCommitDialogProps {
  treeId: string;
  treeName: string;
}

export function GitCommitDialog({ treeId, treeName }: GitCommitDialogProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<GitCommitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await api.git.status();
      setStatus(s);
    } catch (err) {
      setError("Failed to fetch git configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchStatus();
      setCommitMessage(`Update ${treeName}`);
      setResult(null);
      setError(null);
    }
  }, [open, treeName]);

  const handleCommit = async () => {
    setCommitting(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.git.commit(treeId, commitMessage);
      setResult(r);
      // Auto-close after 3s on success
      setTimeout(() => setOpen(false), 3000);
    } catch (err: any) {
      setError(err.message || "Git commit failed");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="text-xs px-3 py-1.5 rounded-md transition-colors text-gray-600 hover:bg-gray-100 flex items-center gap-1.5"
          title="Commit tree to git"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <line x1="3" y1="12" x2="9" y2="12"/>
            <line x1="15" y1="12" x2="21" y2="12"/>
          </svg>
          Git
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Commit to Git</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-4 text-center text-gray-500 text-sm">Checking git configuration...</div>
        ) : status && !status.configured ? (
          <div className="py-4 space-y-3">
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
              Git export is not configured. Set <code className="bg-amber-100 px-1 rounded">OST_GIT_REMOTE_URL</code> in your <code className="bg-amber-100 px-1 rounded">.env</code> file.
            </div>
            <div className="text-xs text-gray-500">
              Example: <code>OST_GIT_REMOTE_URL=git@github.com:myorg/ost-trees.git</code>
            </div>
          </div>
        ) : status ? (
          <div className="space-y-4">
            {/* Config info */}
            <div className="text-xs space-y-1 text-gray-500 bg-gray-50 rounded-md p-3">
              <div><span className="font-medium text-gray-700">Remote:</span> {status.remote_url}</div>
              <div><span className="font-medium text-gray-700">Branch:</span> {status.branch}</div>
              <div><span className="font-medium text-gray-700">Author:</span> {status.user_name || "not set"} {status.user_email ? `<${status.user_email}>` : ""}</div>
            </div>

            {/* Commit message */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Commit message</label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm resize-none"
                rows={3}
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Describe the changes..."
                disabled={committing}
              />
            </div>

            {/* Error display */}
            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
                {error}
              </div>
            )}

            {/* Success display */}
            {result && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3 space-y-1">
                {result.no_changes ? (
                  <div>No changes — tree JSON is already up to date.</div>
                ) : (
                  <>
                    <div>Committed and pushed!</div>
                    <div className="text-xs text-green-600">
                      SHA: <code>{result.commit_sha.slice(0, 12)}</code>
                    </div>
                  </>
                )}
                <div className="text-xs text-green-600">
                  File: <code>{result.file_path}</code>
                </div>
              </div>
            )}

            {/* Action button */}
            {!result && (
              <Button
                onClick={handleCommit}
                disabled={committing || !commitMessage.trim()}
                className="w-full"
              >
                {committing ? "Committing..." : "Commit & Push"}
              </Button>
            )}
          </div>
        ) : error ? (
          <div className="py-4 text-sm text-red-600">{error}</div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
