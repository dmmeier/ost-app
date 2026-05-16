"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useRouter } from "next/navigation";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useTree, useAutoValidate, useProjectList } from "@/hooks/use-tree";
import { useTreePolling } from "@/hooks/use-tree-polling";
import { useTreeStore } from "@/stores/tree-store";
import { useAuthStore } from "@/stores/auth-store";
import { TreeCanvas } from "@/components/tree/TreeCanvas";
import { TreeSelector } from "@/components/panels/TreeSelector";
import { Wordmark } from "@/components/brand/Wordmark";
import { BrandMark } from "@/components/brand/BrandMark";
import { NodeDetailPanel } from "@/components/panels/NodeDetailPanel";
import { ContextPanel } from "@/components/panels/ContextPanel";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { HistoryPanel } from "@/components/panels/HistoryPanel";
import { ActivityPanel } from "@/components/panels/ActivityPanel";
import { useAddNode } from "@/hooks/use-tree";
import { useCanEdit } from "@/hooks/use-permissions";
import { Input } from "@/components/ui/input";

const BOTTOM_TABS = [
  { key: "detail" as const, label: "Detail" },
  { key: "context" as const, label: "Context" },
  { key: "history" as const, label: "History" },
  { key: "activity" as const, label: "Activity" },
];

export default function Home() {
  const router = useRouter();
  const { user, isAuthenticated, hydrate, clearAuth } = useAuthStore();
  const canEdit = useCanEdit();
  const [authChecked, setAuthChecked] = useState(false);

  // Hydrate auth state on mount
  useEffect(() => {
    hydrate();
    setAuthChecked(true);
  }, [hydrate]);

  // Redirect to login if user is not authenticated
  useEffect(() => {
    if (authChecked && !isAuthenticated) {
      router.push("/login");
    }
  }, [authChecked, isAuthenticated, router]);

  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const { data: tree, isLoading, error } = useTree(selectedTreeId);
  const {
    bottomPanel,
    setBottomPanel,
    bottomPanelOpen,
    setBottomPanelOpen,
    setValidationReport,
    setSelectedNodeId,
    setChatInitialMessage,
    setCurrentTree,
    chatPanelOpen,
    setChatPanelOpen,
    sidebarOpen,
    setSidebarOpen,
    conflictWarning,
    clearConflictWarning,
  } = useTreeStore();

  // Poll for remote version changes
  useTreePolling(selectedTreeId, tree?.version);

  // Keep store's currentTree in sync with fetched tree data
  useEffect(() => {
    setCurrentTree(tree ?? null);
  }, [tree, setCurrentTree]);

  // Auto-validate when tree data changes
  useAutoValidate(tree);

  // Clear stale state when switching trees
  useEffect(() => {
    setValidationReport(null);
    setSelectedNodeId(null);
    setChatInitialMessage(null);
    setBottomPanelOpen(false);
  }, [selectedTreeId, setValidationReport, setSelectedNodeId, setChatInitialMessage, setBottomPanelOpen]);

  // Auto-open bottom panel when a node is selected
  const selectedNodeId = useTreeStore((s) => s.selectedNodeId);
  useEffect(() => {
    if (selectedNodeId) {
      setBottomPanelOpen(true);
      setBottomPanel("detail");
    }
  }, [selectedNodeId, setBottomPanelOpen, setBottomPanel]);

  // Sidebar panel ref for collapsible control
  const sidebarPanelRef = useRef<PanelImperativeHandle>(null);

  // Sync sidebarOpen store state with the collapsible panel ref
  useEffect(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    if (sidebarOpen && panel.isCollapsed()) {
      panel.expand();
    } else if (!sidebarOpen && !panel.isCollapsed()) {
      panel.collapse();
    }
  }, [sidebarOpen]);

  // Chat panel ref for collapsible control
  const chatPanelRef = useRef<PanelImperativeHandle>(null);

  const toggleChatPanel = useCallback(() => {
    if (chatPanelRef.current?.isCollapsed()) {
      chatPanelRef.current.expand();
    } else {
      chatPanelRef.current?.collapse();
    }
  }, []);

  // Sync chatPanelOpen store state with the collapsible panel ref
  useEffect(() => {
    const panel = chatPanelRef.current;
    if (!panel) return;
    if (chatPanelOpen && panel.isCollapsed()) {
      panel.expand();
    } else if (!chatPanelOpen && !panel.isCollapsed()) {
      panel.collapse();
    }
  }, [chatPanelOpen]);

  // Auto-dismiss conflict warning after 5 seconds
  useEffect(() => {
    if (conflictWarning) {
      const timer = setTimeout(clearConflictWarning, 5000);
      return () => clearTimeout(timer);
    }
  }, [conflictWarning, clearConflictWarning]);

  // Show loading while checking auth status
  if (!authChecked) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'var(--ost-canvas)' }}>
        <div className="text-sm" style={{ color: 'var(--ost-muted)' }}>Loading...</div>
      </div>
    );
  }

  // Don't render the main app if user is not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Conflict warning toast */}
      {conflictWarning && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-100 border border-amber-400 text-amber-800 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 max-w-lg">
          <span className="text-sm">{conflictWarning}</span>
          <button onClick={clearConflictWarning} className="ml-2 text-amber-600 hover:text-amber-800 font-bold">&times;</button>
        </div>
      )}

      {/* Header */}
      <header className="h-12 border-b flex items-center justify-between px-4 shrink-0" style={{ background: 'var(--ost-sidebar)', borderColor: 'var(--ost-line)', color: 'var(--ost-ink)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <Wordmark height={28} className="shrink-0" variant="light" />
          <Breadcrumbs tree={tree ?? null} />
        </div>
        <div className="flex items-center gap-2">
          {tree && (
            <button
              onClick={toggleChatPanel}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                chatPanelOpen
                  ? "bg-[#0d9488] text-white"
                  : "hover:bg-[var(--ost-chip)]"
              }`}
              style={chatPanelOpen ? undefined : { color: 'var(--ost-ink)' }}
              title={chatPanelOpen ? "Hide chat panel" : "Show chat panel"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Chat
            </button>
          )}
          {!canEdit && (
            <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
              View only
            </span>
          )}
          <SettingsDialog />
          {isAuthenticated && user && (
            <div className="flex items-center gap-2 ml-2 pl-2" style={{ borderLeft: '1px solid var(--ost-line)' }}>
              <span className="text-xs truncate max-w-[120px]" style={{ color: 'var(--ost-muted)' }} title={user.email}>
                {user.display_name}
              </span>
              <button
                onClick={() => { clearAuth(); router.push("/login"); }}
                className="text-xs transition-colors"
                style={{ color: 'var(--ost-muted)' }}
                title="Sign out"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main content: vertical split (top area + bottom panel) */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="vertical">
          {/* Top area: sidebar + canvas + chat */}
          <ResizablePanel id="top" defaultSize="70%" minSize="30%">
            <ResizablePanelGroup orientation="horizontal">
              {/* Left sidebar: Tree selector (collapsible — always mounted) */}
              {!sidebarOpen && (
                <div
                  onClick={() => setSidebarOpen(true)}
                  className="w-6 flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                  style={{ background: 'var(--ost-sidebar)', borderRight: '1px solid var(--ost-line)', color: 'var(--ost-muted)' }}
                  title="Open sidebar"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              )}
              <ResizablePanel
                id="sidebar"
                panelRef={sidebarPanelRef}
                defaultSize="18%"
                minSize="12%"
                maxSize="28%"
                collapsible
                collapsedSize={0}
                onResize={(size) => {
                  const collapsed = size.asPercentage === 0;
                  if (collapsed && sidebarOpen) setSidebarOpen(false);
                  else if (!collapsed && !sidebarOpen) setSidebarOpen(true);
                }}
              >
                <div className="h-full overflow-y-auto border-r p-3" style={{ background: 'var(--ost-sidebar)', borderColor: 'var(--ost-line)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--ost-muted)', fontFamily: 'var(--font-ost-mono)' }}>Projects</span>
                    <button
                      onClick={() => setSidebarOpen(false)}
                      className="p-0.5 transition-colors"
                      style={{ color: 'var(--ost-muted)' }}
                      title="Collapse sidebar"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                  </div>
                  <TreeSelector
                    selectedTreeId={selectedTreeId}
                    onSelectTree={setSelectedTreeId}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle className={sidebarOpen ? "" : "hidden"} />

              {/* Center: Tree canvas */}
              <ResizablePanel id="canvas" defaultSize="52%" minSize="30%">
                <div className="h-full" style={{ background: 'var(--ost-canvas)' }}>
                  {!selectedTreeId ? (
                    <div className="h-full flex items-center justify-center" style={{ color: 'var(--ost-muted)' }}>
                      <div className="text-center max-w-md">
                        <BrandMark size={48} className="mx-auto mb-4 opacity-25 text-[#0d9488]" />
                        <p className="text-lg mb-2">Select or create a tree to get started</p>
                        <p className="text-sm">Create a project first, then add trees within it using the sidebar</p>
                      </div>
                    </div>
                  ) : isLoading ? (
                    <div className="h-full flex items-center justify-center" style={{ color: 'var(--ost-muted)' }}>
                      Loading tree...
                    </div>
                  ) : error ? (
                    <div className="h-full flex items-center justify-center text-red-500">
                      Error loading tree: {(error as Error).message}
                    </div>
                  ) : tree ? (
                    tree.nodes.length === 0 ? (
                      <EmptyTreePrompt treeId={tree.id} />
                    ) : (
                      <TreeCanvas tree={tree} />
                    )
                  ) : null}
                </div>
              </ResizablePanel>

              {/* Right: Chat (collapsible — always mounted for state persistence) */}
              <ResizableHandle withHandle className={chatPanelOpen ? "" : "hidden"} />
              <ResizablePanel
                id="chat"
                panelRef={chatPanelRef}
                defaultSize="30%"
                minSize="20%"
                maxSize="45%"
                collapsible
                collapsedSize={0}
                onResize={(size) => {
                  const collapsed = size.asPercentage === 0;
                  if (collapsed && chatPanelOpen) setChatPanelOpen(false);
                  else if (!collapsed && !chatPanelOpen) setChatPanelOpen(true);
                }}
              >
                <div className="h-full overflow-hidden" style={{ borderLeft: '1px solid var(--ost-line)', background: 'var(--ost-paper)' }}>
                  {tree ? (
                    <ChatPanel treeId={tree.id} projectId={tree.project_id} />
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--ost-muted)' }}>
                      <div className="text-center">
                        <BrandMark size={32} className="mx-auto mb-2 opacity-20 text-[#0d9488]" />
                        <p>Select a tree to start chatting</p>
                      </div>
                    </div>
                  )}
                </div>
              </ResizablePanel>
              {!chatPanelOpen && tree && (
                <div
                  onClick={() => chatPanelRef.current?.expand()}
                  className="w-6 flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                  style={{ borderLeft: '1px solid var(--ost-line)', background: 'var(--ost-sidebar)', color: 'var(--ost-muted)' }}
                  title="Open chat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </div>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>

          {/* Pull-up handle when bottom panel is closed */}
          {!bottomPanelOpen && tree && (
            <div
              onClick={() => setBottomPanelOpen(true)}
              className="h-6 flex items-center justify-center cursor-pointer shrink-0 transition-colors"
              style={{ borderTop: '1px solid var(--ost-line)', background: 'var(--ost-sidebar)', color: 'var(--ost-muted)' }}
              title="Open panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="18 15 12 9 6 15" /></svg>
            </div>
          )}

          {/* Bottom panel (collapsible) */}
          {bottomPanelOpen && tree && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel id="bottom" defaultSize="30%" minSize="15%" maxSize="60%">
                <div className="h-full flex flex-col" style={{ borderTop: '1px solid var(--ost-line)', background: 'var(--ost-paper)' }}>
                  {/* Tab bar */}
                  <div className="flex items-center justify-between px-3 py-1 shrink-0" style={{ borderBottom: '1px solid var(--ost-line)', background: 'var(--ost-sidebar)' }}>
                    <div className="flex items-center gap-1">
                      {BOTTOM_TABS.map((tab) => (
                        <button
                          key={tab.key}
                          onClick={() => setBottomPanel(tab.key)}
                          className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                            bottomPanel === tab.key
                              ? "bg-[#0d9488] text-white font-medium"
                              : "hover:bg-[var(--ost-chip)]"
                          }`}
                          style={bottomPanel === tab.key ? undefined : { color: 'var(--ost-muted)' }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setBottomPanelOpen(false)}
                      className="p-0.5 transition-colors"
                      style={{ color: 'var(--ost-muted)' }}
                      title="Collapse panel"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                  </div>
                  {/* Bottom panel content */}
                  <div className="flex-1 overflow-y-auto">
                    {bottomPanel === "detail" ? (
                      <NodeDetailPanel tree={tree} />
                    ) : bottomPanel === "context" ? (
                      <ContextPanel tree={tree} />
                    ) : bottomPanel === "history" ? (
                      <HistoryPanel tree={tree} />
                    ) : bottomPanel === "activity" ? (
                      <ActivityPanel tree={tree} />
                    ) : null}
                  </div>
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

function EmptyTreePrompt({ treeId }: { treeId: string }) {
  return (
    <div className="h-full flex items-center justify-center" style={{ color: 'var(--ost-muted)' }}>
      <div className="text-center max-w-lg">
        <BrandMark size={48} className="mx-auto mb-4 opacity-30 text-[#0d9488]" />
        <p className="text-lg font-medium mb-2" style={{ color: 'var(--ost-ink)', fontFamily: 'var(--font-ost-display)' }}>Start with your Outcome</p>
        <p className="text-sm mb-1" style={{ color: 'var(--ost-ink)' }}>
          An <strong>Outcome</strong> is the measurable business result you want to achieve.
        </p>
        <p className="text-sm mb-5" style={{ color: 'var(--ost-muted)' }}>
          Good outcomes include a metric and target, e.g. &quot;Increase mobile app DAU to 500K&quot;
          or &quot;Reduce churn rate to below 5%&quot;.
        </p>
        <AddRootNodeButton treeId={treeId} />
      </div>
    </div>
  );
}

function Breadcrumbs({ tree }: { tree: { name: string; project_id: string } | null }) {
  const { data: projects } = useProjectList();
  if (!tree) return null;
  const project = projects?.find((p) => p.id === tree.project_id);
  if (!project) return null;
  return (
    <div className="flex items-center gap-1.5 text-sm min-w-0 overflow-hidden">
      <span className="truncate max-w-[200px]" style={{ color: 'var(--ost-muted)' }} title={project.name}>{project.name}</span>
      <span className="shrink-0" style={{ color: '#c8bea5' }}>&rsaquo;</span>
      <span className="font-medium truncate max-w-[240px]" style={{ color: 'var(--ost-ink)' }} title={tree.name}>{tree.name}</span>
    </div>
  );
}

function AddRootNodeButton({ treeId }: { treeId: string }) {
  const [title, setTitle] = useState("");
  const addNode = useAddNode(treeId);

  const handleAdd = () => {
    if (!title) return;
    addNode.mutate({ title, node_type: "outcome" }, {
      onSuccess: () => setTitle(""),
    });
  };

  return (
    <div className="flex gap-2 max-w-sm mx-auto">
      <Input
        placeholder="Outcome name (e.g., Increase DAU to 1M)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
      />
      <Button onClick={handleAdd} disabled={!title || addNode.isPending}>
        Add
      </Button>
    </div>
  );
}
