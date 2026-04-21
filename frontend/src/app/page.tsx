"use client";

import { useState, useEffect } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useTree, useAutoValidate } from "@/hooks/use-tree";
import { useTreeStore } from "@/stores/tree-store";
import { TreeCanvas } from "@/components/tree/TreeCanvas";
import { TreeIcon } from "@/components/ui/tree-icon";
import { TreeSelector } from "@/components/panels/TreeSelector";
import { NodeDetailPanel } from "@/components/panels/NodeDetailPanel";
import { ContextPanel } from "@/components/panels/ContextPanel";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { VersionPanel } from "@/components/panels/VersionPanel";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { GitCommitDialog } from "@/components/git/GitCommitDialog";
import { useAddNode } from "@/hooks/use-tree";
import { Input } from "@/components/ui/input";

const BOTTOM_TABS = [
  { key: "detail" as const, label: "Detail" },
  { key: "context" as const, label: "Context" },
  { key: "versions" as const, label: "Versions" },
];

export default function Home() {
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
  } = useTreeStore();

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

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="h-12 border-b flex items-center justify-between px-4 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-lg">OST</h1>
          <span className="text-sm text-gray-500">Opportunity Solution Trees</span>
        </div>
        <div className="flex items-center gap-2">
          {tree && (
            <button
              onClick={() => setChatPanelOpen(!chatPanelOpen)}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                chatPanelOpen
                  ? "bg-teal-500 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
              title={chatPanelOpen ? "Hide chat panel" : "Show chat panel"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Chat
            </button>
          )}
          {tree && (
            <GitCommitDialog treeId={tree.id} treeName={tree.name} />
          )}
          <SettingsDialog />
        </div>
      </header>

      {/* Main content: vertical split (top area + bottom panel) */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="vertical">
          {/* Top area: sidebar + canvas + chat */}
          <ResizablePanel id="top" defaultSize="70%" minSize="30%">
            <ResizablePanelGroup orientation="horizontal">
              {/* Left sidebar: Tree selector (collapsible) */}
              {sidebarOpen ? (
                <>
                  <ResizablePanel id="sidebar" defaultSize="18%" minSize="12%" maxSize="28%">
                    <div className="h-full overflow-y-auto border-r bg-gray-50/50 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold uppercase text-gray-400">Projects</span>
                        <button
                          onClick={() => setSidebarOpen(false)}
                          className="text-gray-400 hover:text-gray-600 p-0.5"
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
                  <ResizableHandle withHandle />
                </>
              ) : (
                <div
                  onClick={() => setSidebarOpen(true)}
                  className="w-6 flex items-center justify-center border-r bg-gray-50 hover:bg-gray-100 cursor-pointer shrink-0 transition-colors"
                  title="Open sidebar"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              )}

              {/* Center: Tree canvas */}
              <ResizablePanel id="canvas" defaultSize={chatPanelOpen ? "52%" : "82%"} minSize="30%">
                <div className="h-full bg-white">
                  {!selectedTreeId ? (
                    <div className="h-full flex items-center justify-center text-gray-400">
                      <div className="text-center max-w-md">
                        <TreeIcon size={48} className="mx-auto mb-4 text-gray-300" />
                        <p className="text-lg mb-2">Select or create a tree to get started</p>
                        <p className="text-sm">Create a project first, then add trees within it using the sidebar</p>
                      </div>
                    </div>
                  ) : isLoading ? (
                    <div className="h-full flex items-center justify-center text-gray-400">
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

              {/* Right: Chat (collapsible) */}
              {chatPanelOpen ? (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel id="chat" defaultSize="30%" minSize="20%" maxSize="45%">
                    <div className="h-full overflow-hidden border-l bg-white">
                      {tree ? (
                        <ChatPanel treeId={tree.id} />
                      ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                          <p>Select a tree to start chatting</p>
                        </div>
                      )}
                    </div>
                  </ResizablePanel>
                </>
              ) : tree ? (
                <div
                  onClick={() => setChatPanelOpen(true)}
                  className="w-6 flex items-center justify-center border-l bg-gray-50 hover:bg-gray-100 cursor-pointer shrink-0 transition-colors"
                  title="Open chat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><polyline points="15 18 9 12 15 6"/></svg>
                </div>
              ) : null}
            </ResizablePanelGroup>
          </ResizablePanel>

          {/* Pull-up handle when bottom panel is closed */}
          {!bottomPanelOpen && tree && (
            <div
              onClick={() => setBottomPanelOpen(true)}
              className="h-6 flex items-center justify-center border-t bg-gray-50 hover:bg-gray-100 cursor-pointer shrink-0 transition-colors"
              title="Open panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-400"><polyline points="18 15 12 9 6 15" /></svg>
            </div>
          )}

          {/* Bottom panel (collapsible) */}
          {bottomPanelOpen && tree && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel id="bottom" defaultSize="30%" minSize="15%" maxSize="60%">
                <div className="h-full flex flex-col border-t bg-white">
                  {/* Tab bar */}
                  <div className="flex items-center justify-between px-3 py-1 border-b bg-gray-50 shrink-0">
                    <div className="flex items-center gap-1">
                      {BOTTOM_TABS.map((tab) => (
                        <button
                          key={tab.key}
                          onClick={() => setBottomPanel(tab.key)}
                          className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                            bottomPanel === tab.key
                              ? "bg-gray-700 text-white"
                              : "text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setBottomPanelOpen(false)}
                      className="text-gray-400 hover:text-gray-600 p-0.5"
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
                    ) : bottomPanel === "versions" ? (
                      <VersionPanel tree={tree} />
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
    <div className="h-full flex items-center justify-center text-gray-400">
      <div className="text-center max-w-lg">
        <div className="mb-4 opacity-40">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-gray-400"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        </div>
        <p className="text-lg font-medium text-gray-600 mb-2">Start with your Outcome</p>
        <p className="text-sm text-gray-500 mb-1">
          An <strong>Outcome</strong> is the measurable business result you want to achieve.
        </p>
        <p className="text-sm text-gray-400 mb-5">
          Good outcomes include a metric and target, e.g. &quot;Increase mobile app DAU to 500K&quot;
          or &quot;Reduce churn rate to below 5%&quot;.
        </p>
        <AddRootNodeButton treeId={treeId} />
      </div>
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
