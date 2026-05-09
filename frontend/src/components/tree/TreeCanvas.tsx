"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node as RFNode,
  Edge as RFEdge,
  useNodesState,
  useEdgesState,
  NodeMouseHandler,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { TreeWithNodes, Node, NodeType, BubbleDefaults, FillStyle, STANDARD_NODE_TYPES, Tag } from "@/lib/types";
import { NODE_COLORS, NODE_LABELS, DEFAULT_BUBBLE_DEFAULTS, getNodeLabel, getNodeColor } from "@/lib/colors";
import { getLayoutedElements } from "@/lib/tree-layout";
import { useTreeStore } from "@/stores/tree-store";
import { useAddNode, useDeleteNode, useUpdateNode, useReorderNode, useMoveNode, useBubbleDefaults, useProjectTags } from "@/hooks/use-tree";
import { useCanEdit } from "@/hooks/use-permissions";
import { OSTNode } from "./OSTNode";
import { HypothesisEdge } from "./HypothesisEdge";
import { NodeStyleDialog } from "./NodeStyleDialog";

const nodeTypes = { ostNode: OSTNode };
const edgeTypes = { hypothesis: HypothesisEdge };

interface TreeCanvasProps {
  tree: TreeWithNodes;
}

function computeBfsIndexes(nodes: Node[]): Map<string, number> {
  const childrenMap = new Map<string, Node[]>();
  const roots: Node[] = [];
  for (const n of nodes) {
    if (!n.parent_id) {
      roots.push(n);
    } else {
      const siblings = childrenMap.get(n.parent_id) || [];
      siblings.push(n);
      childrenMap.set(n.parent_id, siblings);
    }
  }
  // Sort roots by sort_order
  roots.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  // Sort children by sort_order for consistent BFS numbering
  for (const [, children] of childrenMap) {
    children.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }
  const indexMap = new Map<string, number>();
  if (roots.length === 0) return indexMap;
  // BFS across all roots sequentially
  const queue: Node[] = [...roots];
  let idx = 1;
  while (queue.length > 0) {
    const current = queue.shift()!;
    indexMap.set(current.id, idx++);
    const children = childrenMap.get(current.id) || [];
    queue.push(...children);
  }
  return indexMap;
}

function getDescendantIds(nodeId: string, nodes: Node[]): Set<string> {
  const childrenMap = new Map<string, Node[]>();
  for (const n of nodes) {
    if (n.parent_id) {
      const siblings = childrenMap.get(n.parent_id) || [];
      siblings.push(n);
      childrenMap.set(n.parent_id, siblings);
    }
  }
  const descendants = new Set<string>();
  const queue = childrenMap.get(nodeId) || [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    descendants.add(current.id);
    queue.push(...(childrenMap.get(current.id) || []));
  }
  return descendants;
}

function computeNodeDepths(nodes: Node[]): Map<string, number> {
  const depthMap = new Map<string, number>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const node of nodes) {
    if (depthMap.has(node.id)) continue;
    // Walk up to compute depth
    const chain: string[] = [];
    let current: Node | undefined = node;
    while (current && !depthMap.has(current.id)) {
      chain.push(current.id);
      current = current.parent_id ? nodeMap.get(current.parent_id) : undefined;
    }
    const baseDepth = current ? depthMap.get(current.id)! : -1;
    for (let i = chain.length - 1; i >= 0; i--) {
      depthMap.set(chain[i], baseDepth + (chain.length - i));
    }
  }
  return depthMap;
}

function buildReactFlowElements(
  tree: TreeWithNodes,
  collapsedNodes: Set<string>,
  activeTagFilters: Set<string>,
  visibleDepth: number | null,
  expandedBeyondDepth: Set<string>,
  bubbleDefaults?: BubbleDefaults,
  projectTags?: Tag[],
  compact: boolean = false,
) {
  const selectedNodeId = useTreeStore.getState().selectedNodeId;
  const editingNodeId = useTreeStore.getState().editingNodeId;

  // Build children map and count map (sorted by sort_order)
  const childrenMap = new Map<string, Node[]>();
  const childrenCountMap = new Map<string, number>();
  for (const n of tree.nodes) {
    if (n.parent_id) {
      childrenCountMap.set(n.parent_id, (childrenCountMap.get(n.parent_id) || 0) + 1);
      const siblings = childrenMap.get(n.parent_id) || [];
      siblings.push(n);
      childrenMap.set(n.parent_id, siblings);
    }
  }
  // Sort children by sort_order for consistent layout
  for (const [, children] of childrenMap) {
    children.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  // Compute hidden nodes (descendants of collapsed nodes)
  const hiddenNodes = new Set<string>();
  for (const collapsedId of collapsedNodes) {
    const descendants = getDescendantIds(collapsedId, tree.nodes);
    for (const d of descendants) hiddenNodes.add(d);
  }

  // Tag filter: compute visible set (tagged nodes + ancestors)
  let tagFilteredIds: Set<string> | null = null;
  let taggedNodeIds: Set<string> | null = null;
  if (activeTagFilters.size > 0) {
    taggedNodeIds = new Set<string>();
    for (const n of tree.nodes) {
      if (n.tags && n.tags.some((t) => activeTagFilters.has(t))) {
        taggedNodeIds.add(n.id);
      }
    }
    // Walk up parent chains to include ancestors
    const nodeMap = new Map(tree.nodes.map((n) => [n.id, n]));
    tagFilteredIds = new Set(taggedNodeIds);
    for (const nid of taggedNodeIds) {
      let current = nodeMap.get(nid);
      while (current?.parent_id) {
        if (tagFilteredIds.has(current.parent_id)) break;
        tagFilteredIds.add(current.parent_id);
        current = nodeMap.get(current.parent_id);
      }
    }
  }

  const indexMap = computeBfsIndexes(tree.nodes);
  const nodeDepths = computeNodeDepths(tree.nodes);

  // Compute nodes made visible by per-node expansion beyond global depth.
  // Only process expanded nodes that are themselves visible (within depth or already extra-visible).
  const extraVisibleByExpand = new Set<string>();
  if (visibleDepth !== null && expandedBeyondDepth.size > 0) {
    // Start BFS only from expanded nodes that are within the base visible depth
    const queue: string[] = [];
    for (const nodeId of expandedBeyondDepth) {
      const depth = nodeDepths.get(nodeId) ?? 0;
      if (depth <= visibleDepth) {
        queue.push(nodeId);
      }
    }
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const children = childrenMap.get(nodeId) || [];
      for (const child of children) {
        const childDepth = nodeDepths.get(child.id) ?? 0;
        if (childDepth > visibleDepth && !extraVisibleByExpand.has(child.id)) {
          extraVisibleByExpand.add(child.id);
          // If this child is also expanded beyond depth, recurse into its children
          if (expandedBeyondDepth.has(child.id)) {
            queue.push(child.id);
          }
        }
      }
    }
  }

  // Build tag lookup for fill cascade and colored chips
  const tagLookup = new Map<string, Tag>();
  if (projectTags) {
    for (const t of projectTags) {
      tagLookup.set(t.name, t);
    }
  }

  const visibleNodes = tree.nodes.filter((n) => {
    if (hiddenNodes.has(n.id)) return false;
    if (tagFilteredIds && !tagFilteredIds.has(n.id)) return false;
    if (visibleDepth !== null && (nodeDepths.get(n.id) ?? 0) > visibleDepth && !extraVisibleByExpand.has(n.id)) return false;
    return true;
  });

  const rfNodes: RFNode[] = visibleNodes.map((node) => {
    const nodeDepth = nodeDepths.get(node.id) ?? 0;
    const childDepth = nodeDepth + 1;

    // Determine tag-based fill: first tag alphabetically with a non-null fill_style wins
    let tagFillColor: string | null = null;
    let tagFillStyle: string | null = null;
    let tagFontLight = false;
    const nodeTags = (node.tags || []).slice().sort();
    for (const tagName of nodeTags) {
      const tagObj = tagLookup.get(tagName);
      if (tagObj?.fill_style && tagObj.fill_style !== "none") {
        tagFillColor = tagObj.color;
        tagFillStyle = tagObj.fill_style;
        tagFontLight = tagObj.font_light ?? false;
        break;
      }
    }

    // Font light cascade: node override > tag > bubble default > false
    let fontLight = false;
    const typeDefaults = (bubbleDefaults ?? {})[node.node_type];
    if (typeDefaults?.font_light) fontLight = true;
    if (tagFillColor) fontLight = tagFontLight;
    if (node.override_font_light !== null && node.override_font_light !== undefined)
      fontLight = node.override_font_light;

    // Build tag color map for colored chips
    const tagColorMap: Record<string, string> = {};
    for (const tagName of (node.tags || [])) {
      const tagObj = tagLookup.get(tagName);
      if (tagObj) {
        tagColorMap[tagName] = tagObj.color;
      }
    }

    return {
      id: node.id,
      type: "ostNode",
      position: { x: 0, y: 0 },
      data: {
        title: node.title,
        nodeType: node.node_type,
        description: node.description,
        status: node.status,
        isSelected: node.id === selectedNodeId,
        index: indexMap.get(node.id),
        childCount: childrenCountMap.get(node.id) || 0,
        isCollapsed: collapsedNodes.has(node.id),
        hasAssumption: !!(node.assumption || "").trim(),
        tags: node.tags || [],
        isAncestorOnly: taggedNodeIds ? !taggedNodeIds.has(node.id) : false,
        depthHidesChildren: visibleDepth !== null && childDepth > visibleDepth,
        isExpandedBeyondDepth: expandedBeyondDepth.has(node.id),
        bubbleDefaults: bubbleDefaults,
        overrideBorderColor: node.override_border_color,
        overrideBorderWidth: node.override_border_width,
        overrideFillColor: node.override_fill_color,
        overrideFillStyle: node.override_fill_style,
        tagFillColor,
        tagFillStyle,
        fontLight,
        tagColorMap,
        sortOrder: node.sort_order ?? 0,
        isEditing: node.id === editingNodeId,
      },
    };
  });

  const visibleIds = new Set(visibleNodes.map((n) => n.id));

  const rfEdges: RFEdge[] = visibleNodes
    .filter((n) => n.parent_id && visibleIds.has(n.parent_id))
    .map((node) => ({
      id: `e-${node.parent_id}-${node.id}`,
      source: node.parent_id!,
      target: node.id,
      type: "hypothesis",
      data: {
        thickness: node.edge_thickness ?? undefined,
        parentNodeId: node.parent_id,
        childNodeId: node.id,
      },
    }));

  const { nodes: lNodes, edges: lEdges } = getLayoutedElements(rfNodes, rfEdges, "TB", compact);
  return { nodes: lNodes, edges: lEdges };
}

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
  nodeType: NodeType;
  nodeTitle: string;
}

interface EdgeContextMenuState {
  x: number;
  y: number;
  childNodeId: string;
  currentThickness: number;
}

// Helper: highlight matching text in search results
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 rounded-sm">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function TreeCanvasInner({ tree }: TreeCanvasProps) {
  const { selectedNodeId, setSelectedNodeId, setBottomPanel, setBottomPanelOpen } = useTreeStore();
  const { data: bubbleDefaults } = useBubbleDefaults(tree.project_id);
  const { data: projectTags } = useProjectTags(tree.project_id);
  const collapsedNodes = useTreeStore((s) => s.collapsedNodes);
  const activeTagFilters = useTreeStore((s) => s.activeTagFilters);
  const toggleTagFilter = useTreeStore((s) => s.toggleTagFilter);
  const visibleDepth = useTreeStore((s) => s.visibleDepth);
  const maxTreeDepth = useTreeStore((s) => s.maxTreeDepth);
  const setMaxTreeDepth = useTreeStore((s) => s.setMaxTreeDepth);
  const collapseOneLevel = useTreeStore((s) => s.collapseOneLevel);
  const expandOneLevel = useTreeStore((s) => s.expandOneLevel);
  const expandedBeyondDepth = useTreeStore((s) => s.expandedBeyondDepth);
  const editingNodeId = useTreeStore((s) => s.editingNodeId);
  const compactLayout = useTreeStore((s) => s.compactLayout);
  const setCompactLayout = useTreeStore((s) => s.setCompactLayout);
  const centerOnNodeId = useTreeStore((s) => s.centerOnNodeId);
  const setCenterOnNodeId = useTreeStore((s) => s.setCenterOnNodeId);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [edgeContextMenu, setEdgeContextMenu] = useState<EdgeContextMenuState | null>(null);
  const [paneContextMenu, setPaneContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [styleDialogNodeId, setStyleDialogNodeId] = useState<string | null>(null);
  const addNode = useAddNode(tree.id);
  const deleteNode = useDeleteNode(tree.id);
  const updateNode = useUpdateNode(tree.id);
  const reorderNode = useReorderNode(tree.id);
  const moveNode = useMoveNode(tree.id);
  const [reparentNodeId, setReparentNodeId] = useState<string | null>(null);
  const [reparentInput, setReparentInput] = useState("");
  const [reparentError, setReparentError] = useState<string | null>(null);
  const canEdit = useCanEdit();

  const reactFlowInstance = useReactFlow();

  // Compute and store max tree depth
  useEffect(() => {
    const depths = computeNodeDepths(tree.nodes);
    const max = depths.size > 0 ? Math.max(...depths.values()) : 0;
    if (max !== maxTreeDepth) setMaxTreeDepth(max);
  }, [tree.nodes, maxTreeDepth, setMaxTreeDepth]);

  const effectiveBubbleDefaults = bubbleDefaults ?? DEFAULT_BUBBLE_DEFAULTS;

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => buildReactFlowElements(tree, collapsedNodes, activeTagFilters, visibleDepth, expandedBeyondDepth, effectiveBubbleDefaults, projectTags ?? undefined, compactLayout),
    [tree, selectedNodeId, collapsedNodes, activeTagFilters, visibleDepth, expandedBeyondDepth, effectiveBubbleDefaults, projectTags, editingNodeId, compactLayout]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

  // Auto-fit view when compact layout is toggled
  const prevCompactRef = useRef(compactLayout);
  useEffect(() => {
    if (prevCompactRef.current !== compactLayout) {
      prevCompactRef.current = compactLayout;
      setTimeout(() => {
        reactFlowInstance.fitView({ duration: 300, padding: 0.2 });
      }, 50);
    }
  }, [compactLayout, reactFlowInstance]);

  // Track whether selection was triggered by keyboard (not click)
  const keyboardNavRef = useRef(false);

  // Track previous node IDs to detect new nodes and center on them
  const prevNodeIdsRef = useRef(new Set(tree.nodes.map((n) => n.id)));
  useEffect(() => {
    const currentIds = new Set(tree.nodes.map((n) => n.id));
    const newIds = [...currentIds].filter((id) => !prevNodeIdsRef.current.has(id));
    prevNodeIdsRef.current = currentIds;
    if (newIds.length === 1) {
      // A single node was added — center on it after layout settles
      const newId = newIds[0];
      setTimeout(() => {
        const rfNode = reactFlowInstance.getNodes().find((n) => n.id === newId);
        if (rfNode && rfNode.position) {
          reactFlowInstance.setCenter(
            rfNode.position.x + 140,
            rfNode.position.y + 50,
            { duration: 300, zoom: reactFlowInstance.getZoom() }
          );
        }
      }, 100);
    }
  }, [tree.nodes, reactFlowInstance]);

  // Close context menus on Escape or outside click
  useEffect(() => {
    if (!contextMenu && !edgeContextMenu && !paneContextMenu) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setContextMenu(null); setEdgeContextMenu(null); setPaneContextMenu(null); setConfirmDelete(false); }
    };
    const handleClick = () => { setContextMenu(null); setEdgeContextMenu(null); setPaneContextMenu(null); setConfirmDelete(false); };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("click", handleClick);
    };
  }, [contextMenu, edgeContextMenu, paneContextMenu]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // Don't handle if context menu is open
      if (contextMenu) return;

      const nodeMap = new Map(tree.nodes.map((n) => [n.id, n]));
      const childrenMap = new Map<string, Node[]>();
      for (const n of tree.nodes) {
        if (n.parent_id) {
          const siblings = childrenMap.get(n.parent_id) || [];
          siblings.push(n);
          childrenMap.set(n.parent_id, siblings);
        }
      }
      // Sort children by sort_order for consistent keyboard navigation
      for (const [, children] of childrenMap) {
        children.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      }

      if (e.key === "ArrowUp" && selectedNodeId) {
        e.preventDefault();
        const node = nodeMap.get(selectedNodeId);
        if (node?.parent_id) {
          keyboardNavRef.current = true;
          setSelectedNodeId(node.parent_id);
          setBottomPanel("detail");
        }
      } else if (e.key === "ArrowDown" && selectedNodeId) {
        e.preventDefault();
        const children = childrenMap.get(selectedNodeId) || [];
        if (children.length > 0) {
          keyboardNavRef.current = true;
          setSelectedNodeId(children[0].id);
          setBottomPanel("detail");
        }
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && selectedNodeId) {
        e.preventDefault();
        const node = nodeMap.get(selectedNodeId);
        if (node) {
          let siblings: Node[];
          if (node.parent_id) {
            siblings = childrenMap.get(node.parent_id) || [];
          } else {
            // Root node: siblings are other roots
            siblings = tree.nodes
              .filter((n) => !n.parent_id)
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          }
          const currentIdx = siblings.findIndex((s) => s.id === selectedNodeId);
          if (currentIdx !== -1) {
            const nextIdx = e.key === "ArrowLeft"
              ? Math.max(0, currentIdx - 1)
              : Math.min(siblings.length - 1, currentIdx + 1);
            if (nextIdx !== currentIdx) {
              keyboardNavRef.current = true;
              setSelectedNodeId(siblings[nextIdx].id);
              setBottomPanel("detail");
            }
          }
        }
      } else if (e.key === "Enter" && selectedNodeId) {
        e.preventDefault();
        setBottomPanel("detail");
        setBottomPanelOpen(true);
      } else if (e.key === "Delete" && selectedNodeId) {
        e.preventDefault();
        // Open context menu for delete confirmation on the selected node
        const node = nodeMap.get(selectedNodeId);
        if (node) {
          setContextMenu({
            x: window.innerWidth / 2 - 90,
            y: window.innerHeight / 2 - 100,
            nodeId: node.id,
            nodeType: node.node_type,
            nodeTitle: node.title,
          });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, tree.nodes, contextMenu, setSelectedNodeId, setBottomPanel, setBottomPanelOpen]);

  // Pan to selected node only when navigated via keyboard
  useEffect(() => {
    if (!selectedNodeId || !keyboardNavRef.current) return;
    keyboardNavRef.current = false;
    const rfNode = nodes.find((n) => n.id === selectedNodeId);
    if (rfNode && rfNode.position) {
      reactFlowInstance.setCenter(
        rfNode.position.x + 140,
        rfNode.position.y + 50,
        { duration: 200, zoom: reactFlowInstance.getZoom() }
      );
    }
  }, [selectedNodeId, nodes, reactFlowInstance]);

  // Center on node when triggered from external panels (e.g. focus view)
  useEffect(() => {
    if (!centerOnNodeId) return;
    setCenterOnNodeId(null);
    const rfNode = nodes.find((n) => n.id === centerOnNodeId);
    if (rfNode && rfNode.position) {
      reactFlowInstance.setCenter(
        rfNode.position.x + 140,
        rfNode.position.y + 50,
        { duration: 300, zoom: reactFlowInstance.getZoom() }
      );
    }
  }, [centerOnNodeId, setCenterOnNodeId, nodes, reactFlowInstance]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const newId = node.id === selectedNodeId ? null : node.id;
      setSelectedNodeId(newId);
      // Auto-switch to Detail tab when selecting a node
      if (newId) {
        setBottomPanel("detail");
      }
    },
    [selectedNodeId, setSelectedNodeId, setBottomPanel]
  );

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_, node) => {
      setSelectedNodeId(node.id);
      setBottomPanel("detail");
    },
    [setSelectedNodeId, setBottomPanel]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setContextMenu(null);
    setEdgeContextMenu(null);
    setPaneContextMenu(null);
  }, [setSelectedNodeId]);

  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      event.preventDefault();
      setEdgeContextMenu(null);
      const nodeData = node.data as { nodeType: NodeType; title: string };
      const rawX = (event as unknown as MouseEvent).clientX;
      const rawY = (event as unknown as MouseEvent).clientY;
      const menuWidth = 200;
      const menuHeight = 280;
      const x = rawX + menuWidth > window.innerWidth ? rawX - menuWidth : rawX;
      const y = rawY + menuHeight > window.innerHeight ? rawY - menuHeight : rawY;
      setContextMenu({
        x,
        y,
        nodeId: node.id,
        nodeType: nodeData.nodeType,
        nodeTitle: nodeData.title,
      });
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId]
  );

  const setEditingNodeId = useTreeStore((s) => s.setEditingNodeId);

  const handleAddChild = (childType: string) => {
    if (!contextMenu) return;
    addNode.mutate(
      {
        title: `New ${getNodeLabel(childType, effectiveBubbleDefaults)}`,
        node_type: childType,
        parent_id: contextMenu.nodeId,
      },
      {
        onSuccess: (newNode) => {
          setSelectedNodeId(newNode.id);
          setBottomPanel("detail");
          setEditingNodeId(newNode.id);
        },
      }
    );
    setContextMenu(null);
  };

  const handleDeleteNode = () => {
    if (!contextMenu) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteNode.mutate(contextMenu.nodeId, {
      onSuccess: () => setSelectedNodeId(null),
    });
    setContextMenu(null);
    setConfirmDelete(false);
  };

  const handleEditNode = () => {
    if (!contextMenu) return;
    setSelectedNodeId(contextMenu.nodeId);
    setBottomPanel("detail");
    setContextMenu(null);
  };

  const handleOpenStyleDialog = () => {
    if (!contextMenu) return;
    setStyleDialogNodeId(contextMenu.nodeId);
    setContextMenu(null);
  };

  const handleMoveLeft = () => {
    if (!contextMenu) return;
    reorderNode.mutate({ nodeId: contextMenu.nodeId, direction: "left" });
    setContextMenu(null);
  };

  const handleMoveRight = () => {
    if (!contextMenu) return;
    reorderNode.mutate({ nodeId: contextMenu.nodeId, direction: "right" });
    setContextMenu(null);
  };

  const handleOpenReparent = () => {
    if (!contextMenu) return;
    setReparentNodeId(contextMenu.nodeId);
    setReparentInput("");
    setReparentError(null);
    setContextMenu(null);
  };

  const handleCreateStandalone = (nodeType: string) => {
    addNode.mutate(
      {
        title: `New ${getNodeLabel(nodeType, effectiveBubbleDefaults)}`,
        node_type: nodeType,
      },
      {
        onSuccess: (newNode) => {
          setSelectedNodeId(newNode.id);
          setBottomPanel("detail");
          setEditingNodeId(newNode.id);
        },
      }
    );
    setPaneContextMenu(null);
  };

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      setContextMenu(null);
      setEdgeContextMenu(null);
      const rawX = (event as MouseEvent).clientX;
      const rawY = (event as MouseEvent).clientY;
      const menuWidth = 200;
      const menuHeight = 300;
      const x = rawX + menuWidth > window.innerWidth ? rawX - menuWidth : rawX;
      const y = rawY + menuHeight > window.innerHeight ? rawY - menuHeight : rawY;
      setPaneContextMenu({ x, y });
    },
    []
  );

  const handleReparentSubmit = () => {
    if (!reparentNodeId) return;
    const targetNum = parseInt(reparentInput, 10);
    if (isNaN(targetNum) || targetNum < 1) {
      setReparentError("Enter a valid node number");
      return;
    }
    // Build reverse BFS index map
    const bfsMap = computeBfsIndexes(tree.nodes);
    const reverseBfs = new Map<number, string>();
    for (const [nodeId, idx] of bfsMap) {
      reverseBfs.set(idx, nodeId);
    }
    const targetNodeId = reverseBfs.get(targetNum);
    if (!targetNodeId) {
      setReparentError(`Node #${targetNum} does not exist`);
      return;
    }
    if (targetNodeId === reparentNodeId) {
      setReparentError("Cannot attach a node to itself");
      return;
    }
    const currentNode = tree.nodes.find((n) => n.id === reparentNodeId);
    if (currentNode?.parent_id === targetNodeId) {
      setReparentError(`Already attached to #${targetNum}`);
      return;
    }
    moveNode.mutate(
      { nodeId: reparentNodeId, newParentId: targetNodeId },
      {
        onSuccess: () => {
          setReparentNodeId(null);
          setReparentInput("");
          setReparentError(null);
        },
        onError: (error: Error) => {
          setReparentError(error.message);
        },
      }
    );
  };

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: RFEdge) => {
      event.preventDefault();
      setContextMenu(null);
      const edgeData = edge.data as { childNodeId?: string; thickness?: number };
      const rawX = event.clientX;
      const rawY = event.clientY;
      const menuWidth = 180;
      const menuHeight = 200;
      const x = rawX + menuWidth > window.innerWidth ? rawX - menuWidth : rawX;
      const y = rawY + menuHeight > window.innerHeight ? rawY - menuHeight : rawY;
      setEdgeContextMenu({
        x,
        y,
        childNodeId: edgeData.childNodeId || "",
        currentThickness: edgeData.thickness ?? 2,
      });
    },
    []
  );

  const handleSetEdgeThickness = (thickness: number) => {
    if (!edgeContextMenu || !edgeContextMenu.childNodeId) return;
    // Update edge_thickness on the child node (stores thickness of edge to parent)
    updateNode.mutate({ nodeId: edgeContextMenu.childNodeId, data: { edge_thickness: thickness } });
    setEdgeContextMenu(null);
  };

  const handleSaveStyleOverrides = (overrides: {
    override_border_color: string | null;
    override_border_width: number | null;
    override_fill_color: string | null;
    override_fill_style: string | null;
    override_font_light: boolean | null;
  }) => {
    if (!styleDialogNodeId) return;
    // Send empty string to clear, actual value to set
    updateNode.mutate({
      nodeId: styleDialogNodeId,
      data: {
        override_border_color: overrides.override_border_color ?? "",
        override_border_width: overrides.override_border_width ?? 0,
        override_fill_color: overrides.override_fill_color ?? "",
        override_fill_style: overrides.override_fill_style ?? "",
        override_font_light: overrides.override_font_light,
      },
    });
    setStyleDialogNodeId(null);
  };

  // Any type can be a child of any other type
  const customTypeKeys = Object.keys(effectiveBubbleDefaults).filter(
    (k) => !(STANDARD_NODE_TYPES as readonly string[]).includes(k)
  );
  const validChildren = contextMenu
    ? [...STANDARD_NODE_TYPES, ...customTypeKeys]
    : [];

  // Compute sibling info for the context menu node (for Move Left/Right)
  const contextNodeSiblingInfo = useMemo(() => {
    if (!contextMenu) return { canMoveLeft: false, canMoveRight: false, isRoot: true };
    const node = tree.nodes.find((n) => n.id === contextMenu.nodeId);
    if (!node) return { canMoveLeft: false, canMoveRight: false, isRoot: true };
    const isRoot = !node.parent_id;
    let siblings: Node[];
    if (isRoot) {
      // Root node: siblings are other roots in the same tree
      siblings = tree.nodes
        .filter((n) => !n.parent_id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    } else {
      siblings = tree.nodes
        .filter((n) => n.parent_id === node.parent_id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    const idx = siblings.findIndex((s) => s.id === node.id);
    return {
      canMoveLeft: idx > 0,
      canMoveRight: idx < siblings.length - 1,
      isRoot,
    };
  }, [contextMenu, tree.nodes]);

  // Search functionality
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Ctrl+F keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return tree.nodes.filter(
      (n) => n.title.toLowerCase().includes(q) || (n.description && n.description.toLowerCase().includes(q))
    );
  }, [searchQuery, tree.nodes]);

  const handleSearchResultClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setBottomPanel("detail");
    setSearchOpen(false);
    setSearchQuery("");
    // Pan to the node
    const rfNode = nodes.find((n) => n.id === nodeId);
    if (rfNode && rfNode.position) {
      reactFlowInstance.setCenter(
        rfNode.position.x + 140,
        rfNode.position.y + 50,
        { duration: 300, zoom: reactFlowInstance.getZoom() }
      );
    }
  }, [nodes, reactFlowInstance, setSelectedNodeId, setBottomPanel]);

  // Tree stats
  const stats = useMemo(() => {
    const typeCounts: Record<string, number> = {};
    for (const n of tree.nodes) {
      typeCounts[n.node_type] = (typeCounts[n.node_type] || 0) + 1;
    }
    return { total: tree.nodes.length, typeCounts };
  }, [tree.nodes]);

  // Collect unique tags across all nodes
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const n of tree.nodes) {
      if (n.tags) n.tags.forEach((t) => tagSet.add(t));
    }
    return Array.from(tagSet).sort();
  }, [tree.nodes]);

  // Prune orphaned tag filters (e.g. after tag deletion, rename, or tree switch)
  useEffect(() => {
    const tagSet = new Set(allTags);
    for (const active of activeTagFilters) {
      if (!tagSet.has(active)) {
        toggleTagFilter(active);
      }
    }
  }, [allTags, activeTagFilters, toggleTagFilter]);

  return (
    <div className="w-full h-full relative">
      {/* Unified viewing controls */}
      {tree.nodes.length > 1 && (
        <div className="absolute top-3 left-3 z-40 bg-white rounded-lg border shadow-sm flex flex-col divide-y divide-gray-100">
          {/* Row 1: Level collapse/expand */}
          <div className="flex items-center gap-1 px-2 py-1">
            <button
              onClick={collapseOneLevel}
              disabled={visibleDepth !== null && visibleDepth <= 0}
              className="text-sm px-1.5 py-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Collapse one level"
            >
              −
            </button>
            <span className="text-[11px] text-gray-500 min-w-[56px] text-center font-medium">
              {visibleDepth === null
                ? `All (${maxTreeDepth})`
                : `Level ${visibleDepth}/${maxTreeDepth}`}
            </span>
            <button
              onClick={expandOneLevel}
              disabled={visibleDepth === null}
              className="text-sm px-1.5 py-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Expand one level"
            >
              +
            </button>
          </div>

          {/* Row 2: Compact toggle */}
          <div className="px-2 py-1">
            <button
              onClick={() => setCompactLayout(!compactLayout)}
              className={`text-[11px] px-2 py-0.5 rounded font-medium transition-colors w-full ${
                compactLayout
                  ? "bg-gray-200 text-gray-700"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
              title="Toggle compact layout (pack nodes closer together)"
            >
              Compact
            </button>
          </div>

          {/* Row 3: Search */}
          <div className="relative px-2 py-1">
            {searchOpen ? (
              <div className="flex items-center">
                <input
                  ref={searchInputRef}
                  autoFocus
                  type="text"
                  placeholder="Search nodes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); }
                  }}
                  className="px-2 py-0.5 text-[11px] w-36 outline-none border rounded"
                />
                {searchQuery.trim() && (
                  <div className="absolute top-full mt-1 left-0 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto w-64 z-50">
                    {searchResults.length > 0 ? (
                      searchResults.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleSearchResultClick(n.id)}
                          className="w-full text-left px-2 py-1 text-[11px] hover:bg-gray-50 border-b last:border-b-0 flex items-center gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: effectiveBubbleDefaults[n.node_type]?.border_color ?? "#94a3b8" }} />
                          <span>
                            <HighlightMatch text={n.title} query={searchQuery} />
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="px-2 py-2 text-[11px] text-gray-400 text-center">
                        No results for &quot;{searchQuery}&quot;
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
                className="text-[11px] px-2 py-0.5 rounded text-gray-500 hover:bg-gray-100 flex items-center gap-1 w-full justify-center"
                title="Search nodes (Ctrl+F)"
              >
                Search <kbd className="text-[10px] bg-gray-100 rounded px-1 py-0.5 text-gray-400">⌘F</kbd>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Legend + tag filter */}
      <div className="absolute top-3 right-3 z-20 bg-white/90 backdrop-blur-sm rounded-lg border shadow-sm px-3 py-2 space-y-1.5" style={{ maxWidth: "calc(100% - 200px)" }}>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            {[...STANDARD_NODE_TYPES, ...customTypeKeys].map((t) => (
              <div key={t} className="flex items-center gap-1">
                <div
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: effectiveBubbleDefaults[t]?.border_color ?? DEFAULT_BUBBLE_DEFAULTS[t as keyof typeof DEFAULT_BUBBLE_DEFAULTS]?.border_color ?? "#94a3b8" }}
                />
                <span className="text-gray-600">{getNodeLabel(t, effectiveBubbleDefaults)}</span>
                {stats.typeCounts[t] && <span className="text-gray-400">({stats.typeCounts[t]})</span>}
              </div>
            ))}
          </div>
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-gray-400">Tags:</span>
              {allTags.map((t) => {
                const isActive = activeTagFilters.has(t);
                const tagObj = projectTags?.find((pt) => pt.name === t);
                const tagColor = tagObj?.color ?? "#6b7280";
                return (
                  <button
                    key={t}
                    onClick={() => toggleTagFilter(t)}
                    className={`text-[11px] px-1.5 py-0.5 rounded-full border cursor-pointer transition-colors ${
                      isActive
                        ? ""
                        : "bg-white hover:border-gray-400"
                    }`}
                    style={isActive ? {
                      backgroundColor: tagColor + "20",
                      borderColor: tagColor,
                      color: tagColor,
                    } : {
                      borderColor: tagColor + "60",
                      color: tagColor,
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          )}
      </div>


      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const nodeType = (node.data as { nodeType: string }).nodeType;
            return effectiveBubbleDefaults[nodeType]?.border_color ?? DEFAULT_BUBBLE_DEFAULTS[nodeType as NodeType]?.border_color ?? "#94a3b8";
          }}
          zoomable
          pannable
        />
      </ReactFlow>

      {/* Style override dialog */}
      {styleDialogNodeId && (() => {
        const node = tree.nodes.find((n) => n.id === styleDialogNodeId);
        if (!node) return null;
        // Compute inherited fontLight (bubble default → tag) excluding node override
        let inheritedFontLight = false;
        const tDef = effectiveBubbleDefaults[node.node_type];
        if (tDef?.font_light) inheritedFontLight = true;
        const nodeTags = (node.tags || []).slice().sort();
        for (const tagName of nodeTags) {
          const tagObj = projectTags?.find((pt) => pt.name === tagName);
          if (tagObj?.fill_style && tagObj.fill_style !== "none") {
            inheritedFontLight = tagObj.font_light ?? false;
            break;
          }
        }
        return (
          <NodeStyleDialog
            nodeId={node.id}
            nodeType={node.node_type}
            currentOverrides={{
              override_border_color: node.override_border_color,
              override_border_width: node.override_border_width,
              override_fill_color: node.override_fill_color,
              override_fill_style: node.override_fill_style,
              override_font_light: node.override_font_light,
            }}
            inheritedFontLight={inheritedFontLight}
            bubbleDefaults={effectiveBubbleDefaults}
            onSave={handleSaveStyleOverrides}
            onClose={() => setStyleDialogNodeId(null)}
          />
        );
      })()}

      {/* Reparent dialog */}
      {reparentNodeId && (() => {
        const node = tree.nodes.find((n) => n.id === reparentNodeId);
        if (!node) return null;
        const bfsMap = computeBfsIndexes(tree.nodes);
        const currentIdx = bfsMap.get(reparentNodeId);
        return (
          <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center" onClick={() => setReparentNodeId(null)}>
            <div
              className="bg-white rounded-lg border shadow-xl p-4 w-80"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold mb-1">Attach to New Parent</h3>
              <p className="text-xs text-gray-500 mb-3">
                Move #{currentIdx} &quot;{node.title}&quot; and its subtree to a new parent node.
              </p>
              <label className="text-xs text-gray-600 mb-1 block">Target node #</label>
              <input
                autoFocus
                type="number"
                min={1}
                value={reparentInput}
                onChange={(e) => { setReparentInput(e.target.value); setReparentError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleReparentSubmit();
                  if (e.key === "Escape") setReparentNodeId(null);
                }}
                placeholder="e.g. 5"
                className="w-full border rounded px-2 py-1.5 text-sm mb-2 outline-none focus:ring-1 focus:ring-[#0d9488]"
              />
              {reparentError && (
                <p className="text-xs text-red-600 mb-2">{reparentError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setReparentNodeId(null)}
                  className="px-3 py-1.5 text-xs rounded border hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReparentSubmit}
                  disabled={!reparentInput.trim() || moveNode.isPending}
                  className="px-3 py-1.5 text-xs rounded bg-[#0d9488] text-white hover:bg-[#0b7a70] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {moveNode.isPending ? "Moving…" : "Move"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-white rounded-lg border shadow-lg py-1 z-50 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs text-gray-400 font-medium truncate max-w-[200px] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: effectiveBubbleDefaults[contextMenu.nodeType]?.border_color ?? "#94a3b8" }} />
            {contextMenu.nodeTitle}
          </div>
          <div className="h-px bg-gray-100 my-1" />
          <button
            onClick={handleEditNode}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2"
          >
            Edit Details
          </button>
          {canEdit && (
            <>
              <button
                onClick={handleOpenStyleDialog}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                Style Override
              </button>
              <button
                onClick={handleOpenReparent}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                Attach to…
              </button>
              {(contextNodeSiblingInfo.canMoveLeft || contextNodeSiblingInfo.canMoveRight) && (
                <>
                  <div className="h-px bg-gray-100 my-1" />
                  <div className="flex gap-1 px-3 py-1">
                    <button
                      onClick={handleMoveLeft}
                      disabled={!contextNodeSiblingInfo.canMoveLeft}
                      className="flex-1 text-center py-1 text-sm rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Move Left
                    </button>
                    <button
                      onClick={handleMoveRight}
                      disabled={!contextNodeSiblingInfo.canMoveRight}
                      className="flex-1 text-center py-1 text-sm rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Move Right
                    </button>
                  </div>
                </>
              )}
              {validChildren.length > 0 && (
                <>
                  <div className="h-px bg-gray-100 my-1" />
                  <div className="px-3 py-1 text-xs text-gray-400">Add Child</div>
                  {validChildren.map((childType) => (
                    <button
                      key={childType}
                      onClick={() => handleAddChild(childType)}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: effectiveBubbleDefaults[childType]?.border_color ?? "#94a3b8" }} /> {getNodeLabel(childType, effectiveBubbleDefaults)}
                    </button>
                  ))}
                </>
              )}
              <div className="h-px bg-gray-100 my-1" />
              {confirmDelete ? (
                <div className="px-3 py-1.5 flex items-center gap-2">
                  <button
                    onClick={handleDeleteNode}
                    className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => { setConfirmDelete(false); setContextMenu(null); }}
                    className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleDeleteNode}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                >
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      )}
      {/* Edge context menu (thickness) — editors only */}
      {canEdit && edgeContextMenu && (
        <div
          className="fixed bg-white rounded-lg border shadow-lg py-1 z-50 min-w-[160px]"
          style={{ left: edgeContextMenu.x, top: edgeContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs text-gray-400 font-medium">
            Edge Thickness
          </div>
          <div className="h-px bg-gray-100 my-1" />
          {[1, 2, 3, 4, 5, 6].map((t) => (
            <button
              key={t}
              onClick={() => handleSetEdgeThickness(t)}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2 ${
                edgeContextMenu.currentThickness === t ? "bg-[#e6f4f3] text-[#0b7a70]" : ""
              }`}
            >
              <div
                className="w-8 rounded"
                style={{
                  height: `${t}px`,
                  backgroundColor: "#94a3b8",
                  minHeight: "1px",
                }}
              />
              <span>{t}px</span>
            </button>
          ))}
        </div>
      )}
      {/* Pane context menu (right-click on empty canvas to create standalone node) — editors only */}
      {canEdit && paneContextMenu && (
        <div
          className="fixed bg-white rounded-lg border shadow-lg py-1 z-50 min-w-[180px]"
          style={{ left: paneContextMenu.x, top: paneContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs text-gray-400 font-medium">
            Create Standalone Node
          </div>
          <div className="h-px bg-gray-100 my-1" />
          {[...STANDARD_NODE_TYPES, ...customTypeKeys].map((nodeType) => (
            <button
              key={nodeType}
              onClick={() => handleCreateStandalone(nodeType)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: effectiveBubbleDefaults[nodeType]?.border_color ?? "#94a3b8" }} /> {getNodeLabel(nodeType, effectiveBubbleDefaults)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Wrap in ReactFlowProvider so useReactFlow() works
export function TreeCanvas({ tree }: TreeCanvasProps) {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner tree={tree} />
    </ReactFlowProvider>
  );
}
