import { create } from "zustand";
import { TreeWithNodes, Node, ValidationReport } from "@/lib/types";

type BottomPanelTab = "detail" | "context" | "versions";

interface TreeStore {
  // Selected project
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;

  // Current tree
  currentTree: TreeWithNodes | null;
  setCurrentTree: (tree: TreeWithNodes | null) => void;

  // Selected node
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;

  // Validation
  validationReport: ValidationReport | null;
  setValidationReport: (report: ValidationReport | null) => void;

  // Bottom panel (detail/context/validation/versions)
  bottomPanel: BottomPanelTab;
  setBottomPanel: (tab: BottomPanelTab) => void;
  bottomPanelOpen: boolean;
  setBottomPanelOpen: (open: boolean) => void;

  // Chat mode
  chatMode: "coach" | "builder";
  setChatMode: (mode: "coach" | "builder") => void;

  // Chat initial message (for contextual "Chat about this" triggers)
  chatInitialMessage: string | null;
  setChatInitialMessage: (msg: string | null) => void;

  // Collapsed nodes
  collapsedNodes: Set<string>;
  toggleCollapse: (nodeId: string) => void;

  // Tag filter (multi-tag)
  activeTagFilters: Set<string>;
  toggleTagFilter: (name: string) => void;
  clearTagFilters: () => void;

  // Sidebar visibility
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Chat panel visibility
  chatPanelOpen: boolean;
  setChatPanelOpen: (open: boolean) => void;

  // Auto-validate
  autoValidateEnabled: boolean;
  setAutoValidateEnabled: (enabled: boolean) => void;

  // Level collapse/expand
  visibleDepth: number | null; // null = all visible
  maxTreeDepth: number;
  setMaxTreeDepth: (depth: number) => void;
  collapseOneLevel: () => void;
  expandOneLevel: () => void;

  // Per-node expansion beyond global depth limit
  expandedBeyondDepth: Set<string>;
  toggleExpandBeyondDepth: (nodeId: string) => void;

  // Center canvas on a specific node (consumed by TreeCanvas)
  centerOnNodeId: string | null;
  setCenterOnNodeId: (id: string | null) => void;
}

export const useTreeStore = create<TreeStore>((set) => ({
  selectedProjectId: null,
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),

  currentTree: null,
  setCurrentTree: (tree) => set({ currentTree: tree }),

  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  validationReport: null,
  setValidationReport: (report) => set({ validationReport: report }),

  bottomPanel: "detail",
  setBottomPanel: (tab) => set({ bottomPanel: tab, bottomPanelOpen: true }),
  bottomPanelOpen: false,
  setBottomPanelOpen: (open) => set({ bottomPanelOpen: open }),

  chatMode: "coach",
  setChatMode: (mode) => set({ chatMode: mode }),

  chatInitialMessage: null,
  setChatInitialMessage: (msg) => set({ chatInitialMessage: msg }),

  collapsedNodes: new Set(),
  toggleCollapse: (nodeId) =>
    set((state) => {
      const next = new Set(state.collapsedNodes);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return { collapsedNodes: next };
    }),

  activeTagFilters: new Set(),
  toggleTagFilter: (name) =>
    set((state) => {
      const next = new Set(state.activeTagFilters);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return { activeTagFilters: next };
    }),
  clearTagFilters: () => set({ activeTagFilters: new Set() }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  chatPanelOpen: true,
  setChatPanelOpen: (open) => set({ chatPanelOpen: open }),

  autoValidateEnabled: true,
  setAutoValidateEnabled: (enabled) => set({ autoValidateEnabled: enabled }),

  visibleDepth: null,
  maxTreeDepth: 0,
  setMaxTreeDepth: (depth) => set({ maxTreeDepth: depth }),
  collapseOneLevel: () =>
    set((state) => {
      // Stage-by-stage: remove per-node expansions at the deepest level first
      if (state.expandedBeyondDepth.size > 0) {
        const tree = state.currentTree;
        if (!tree) {
          return { expandedBeyondDepth: new Set() };
        }
        const nodeMap = new Map(tree.nodes.map((n) => [n.id, n]));
        const depthCache = new Map<string, number>();
        const getDepth = (id: string): number => {
          if (depthCache.has(id)) return depthCache.get(id)!;
          let depth = 0;
          let current = nodeMap.get(id);
          while (current?.parent_id) {
            depth++;
            current = nodeMap.get(current.parent_id);
          }
          depthCache.set(id, depth);
          return depth;
        };
        let maxDepth = 0;
        for (const nodeId of state.expandedBeyondDepth) {
          const d = getDepth(nodeId);
          if (d > maxDepth) maxDepth = d;
        }
        const next = new Set(state.expandedBeyondDepth);
        for (const nodeId of state.expandedBeyondDepth) {
          if (getDepth(nodeId) === maxDepth) {
            next.delete(nodeId);
          }
        }
        return { expandedBeyondDepth: next };
      }
      if (state.visibleDepth === null) {
        return { visibleDepth: Math.max(0, state.maxTreeDepth - 1) };
      }
      return { visibleDepth: Math.max(0, state.visibleDepth - 1) };
    }),
  expandOneLevel: () =>
    set((state) => {
      if (state.visibleDepth === null) return {};
      const next = state.visibleDepth + 1;
      if (next >= state.maxTreeDepth) return { visibleDepth: null, expandedBeyondDepth: new Set() };
      return { visibleDepth: next, expandedBeyondDepth: new Set() };
    }),

  centerOnNodeId: null,
  setCenterOnNodeId: (id) => set({ centerOnNodeId: id }),

  expandedBeyondDepth: new Set(),
  toggleExpandBeyondDepth: (nodeId) =>
    set((state) => {
      const next = new Set(state.expandedBeyondDepth);
      if (next.has(nodeId)) {
        // Stage-by-stage collapse: only remove the deepest expanded descendants first
        const tree = state.currentTree;
        if (!tree) {
          next.delete(nodeId);
          return { expandedBeyondDepth: next };
        }

        // Build children map
        const childrenMap = new Map<string, string[]>();
        for (const n of tree.nodes) {
          if (n.parent_id) {
            const siblings = childrenMap.get(n.parent_id) || [];
            siblings.push(n.id);
            childrenMap.set(n.parent_id, siblings);
          }
        }

        // Find all expanded descendants of nodeId (not including nodeId itself)
        const expandedDescendants: string[] = [];
        const bfsQueue = [...(childrenMap.get(nodeId) || [])];
        while (bfsQueue.length > 0) {
          const id = bfsQueue.shift()!;
          if (next.has(id)) {
            expandedDescendants.push(id);
          }
          bfsQueue.push(...(childrenMap.get(id) || []));
        }

        if (expandedDescendants.length === 0) {
          // No expanded descendants — remove this node itself
          next.delete(nodeId);
        } else {
          // Find the deepest expanded descendants and remove only those
          const nodeMap = new Map(tree.nodes.map((n) => [n.id, n]));
          const depthCache = new Map<string, number>();
          const getDepth = (id: string): number => {
            if (depthCache.has(id)) return depthCache.get(id)!;
            let depth = 0;
            let current = nodeMap.get(id);
            while (current?.parent_id) {
              depth++;
              current = nodeMap.get(current.parent_id);
            }
            depthCache.set(id, depth);
            return depth;
          };

          let maxDepth = 0;
          for (const desc of expandedDescendants) {
            const d = getDepth(desc);
            if (d > maxDepth) maxDepth = d;
          }

          for (const desc of expandedDescendants) {
            if (getDepth(desc) === maxDepth) {
              next.delete(desc);
            }
          }
        }

        return { expandedBeyondDepth: next };
      } else {
        next.add(nodeId);
      }
      return { expandedBeyondDepth: next };
    }),
}));
