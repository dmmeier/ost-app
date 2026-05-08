"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

const POLL_INTERVAL_MS = 5000;

/**
 * Polls the lightweight /trees/{id}/version endpoint every 5 seconds.
 * If the remote version is higher than the local version, invalidates
 * the tree query to trigger a refetch.
 *
 * Skips polling when the user is focused in an input/textarea to avoid
 * disrupting mid-edit typing.
 */
export function useTreePolling(
  treeId: string | null,
  localVersion: number | undefined
) {
  const queryClient = useQueryClient();
  const localVersionRef = useRef(localVersion);
  localVersionRef.current = localVersion;

  const poll = useCallback(async () => {
    if (!treeId) return;

    // Skip poll if user is typing in an input/textarea
    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")
    ) {
      return;
    }

    try {
      const { version: remoteVersion } = await api.trees.getVersion(treeId);
      if (
        localVersionRef.current !== undefined &&
        remoteVersion > localVersionRef.current
      ) {
        queryClient.invalidateQueries({ queryKey: ["tree", treeId] });
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [treeId, queryClient]);

  useEffect(() => {
    if (!treeId) return;

    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [treeId, poll]);
}
