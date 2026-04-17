import { Node as RFNode, Edge as RFEdge } from "@xyflow/react";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 100;
const SIBLING_GAP = 40;
const RANK_SEP = NODE_HEIGHT + 80;

/**
 * Custom symmetric tree layout.
 * Children are centered under their parent, ordered by sort_order.
 * Deterministic: same data always produces the same positions.
 * No automatic rearranging of existing nodes when new nodes are added.
 */
export function getLayoutedElements(
  nodes: RFNode[],
  edges: RFEdge[],
  direction: "TB" | "LR" = "TB"
): { nodes: RFNode[]; edges: RFEdge[] } {
  if (nodes.length === 0) return { nodes, edges };

  // Build parent -> children map from edges, preserving sort_order from node data
  const childrenMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();
  for (const edge of edges) {
    const children = childrenMap.get(edge.source) || [];
    children.push(edge.target);
    childrenMap.set(edge.source, children);
    parentMap.set(edge.target, edge.source);
  }

  // Sort children by sort_order (from node data)
  const nodeDataMap = new Map<string, RFNode>();
  for (const node of nodes) {
    nodeDataMap.set(node.id, node);
  }
  for (const [parentId, children] of childrenMap) {
    children.sort((a, b) => {
      const aOrder = (nodeDataMap.get(a)?.data as { sortOrder?: number })?.sortOrder ?? 0;
      const bOrder = (nodeDataMap.get(b)?.data as { sortOrder?: number })?.sortOrder ?? 0;
      return aOrder - bOrder;
    });
  }

  // Find root (node with no parent in the edge set)
  const childSet = new Set(edges.map((e) => e.target));
  const root = nodes.find((n) => !childSet.has(n.id));
  if (!root) {
    // Fallback: just use first node
    return { nodes, edges };
  }

  // Compute subtree widths (memoized)
  const subtreeWidthCache = new Map<string, number>();
  function subtreeWidth(nodeId: string): number {
    if (subtreeWidthCache.has(nodeId)) return subtreeWidthCache.get(nodeId)!;
    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) {
      subtreeWidthCache.set(nodeId, NODE_WIDTH);
      return NODE_WIDTH;
    }
    const total =
      children.reduce((sum, cid) => sum + subtreeWidth(cid), 0) +
      (children.length - 1) * SIBLING_GAP;
    const width = Math.max(NODE_WIDTH, total);
    subtreeWidthCache.set(nodeId, width);
    return width;
  }

  // Position nodes recursively
  const positions = new Map<string, { x: number; y: number }>();

  function layout(nodeId: string, centerX: number, y: number) {
    positions.set(nodeId, {
      x: centerX - NODE_WIDTH / 2,
      y,
    });
    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) return;

    const totalChildrenWidth =
      children.reduce((sum, cid) => sum + subtreeWidth(cid), 0) +
      (children.length - 1) * SIBLING_GAP;

    let leftEdge = centerX - totalChildrenWidth / 2;
    for (const childId of children) {
      const childTreeWidth = subtreeWidth(childId);
      const childCenterX = leftEdge + childTreeWidth / 2;
      layout(childId, childCenterX, y + RANK_SEP);
      leftEdge += childTreeWidth + SIBLING_GAP;
    }
  }

  layout(root.id, 0, 0);

  const layoutedNodes = nodes.map((node) => {
    const pos = positions.get(node.id);
    return {
      ...node,
      position: pos || { x: 0, y: 0 },
    };
  });

  return { nodes: layoutedNodes, edges };
}
