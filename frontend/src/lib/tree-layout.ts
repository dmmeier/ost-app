import { Node as RFNode, Edge as RFEdge } from "@xyflow/react";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 100;
const SIBLING_GAP = 40;
const RANK_SEP = NODE_HEIGHT + 80;
const TREE_GAP = 3 * SIBLING_GAP;

/**
 * Custom symmetric tree layout.
 * Children are centered under their parent, ordered by sort_order.
 * Deterministic: same data always produces the same positions.
 *
 * When compact=true, uses Reingold-Tilford contour-based positioning
 * that allows nodes to use space above children of sibling subtrees,
 * resulting in much narrower trees.
 */
export function getLayoutedElements(
  nodes: RFNode[],
  edges: RFEdge[],
  direction: "TB" | "LR" = "TB",
  compact: boolean = false
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

  // Find ALL roots (nodes with no parent in the edge set)
  const childSet = new Set(edges.map((e) => e.target));
  const roots = nodes.filter((n) => !childSet.has(n.id));
  if (roots.length === 0) {
    return { nodes, edges };
  }

  // Sort roots by sort_order for consistent layout
  roots.sort((a, b) => {
    const aOrder = (a.data as { sortOrder?: number })?.sortOrder ?? 0;
    const bOrder = (b.data as { sortOrder?: number })?.sortOrder ?? 0;
    return aOrder - bOrder;
  });

  const positions = new Map<string, { x: number; y: number }>();

  if (roots.length === 1) {
    // Single root: use standard layout
    if (compact) {
      layoutCompact(roots[0].id, childrenMap, positions);
    } else {
      layoutWide(roots[0].id, childrenMap, positions);
    }
  } else {
    // Multiple roots: layout each subtree independently, then arrange side by side
    const subtreePositions: Map<string, { x: number; y: number }>[] = [];
    const subtreeBounds: { minX: number; maxX: number; minY: number; maxY: number }[] = [];

    for (const root of roots) {
      const subPos = new Map<string, { x: number; y: number }>();
      if (compact) {
        layoutCompact(root.id, childrenMap, subPos);
      } else {
        layoutWide(root.id, childrenMap, subPos);
      }
      subtreePositions.push(subPos);

      // Compute bounding box of this subtree
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const pos of subPos.values()) {
        if (pos.x < minX) minX = pos.x;
        if (pos.x + NODE_WIDTH > maxX) maxX = pos.x + NODE_WIDTH;
        if (pos.y < minY) minY = pos.y;
        if (pos.y + NODE_HEIGHT > maxY) maxY = pos.y + NODE_HEIGHT;
      }
      subtreeBounds.push({ minX, maxX, minY, maxY });
    }

    // Arrange subtrees side by side
    let currentX = 0;
    const totalWidth =
      subtreeBounds.reduce((sum, b) => sum + (b.maxX - b.minX), 0) +
      (subtreeBounds.length - 1) * TREE_GAP;
    let startX = -totalWidth / 2;

    for (let i = 0; i < roots.length; i++) {
      const subPos = subtreePositions[i];
      const bounds = subtreeBounds[i];
      const offsetX = startX - bounds.minX;
      const offsetY = -bounds.minY; // Align all subtree roots at y=0

      for (const [nodeId, pos] of subPos) {
        positions.set(nodeId, {
          x: pos.x + offsetX,
          y: pos.y + offsetY,
        });
      }

      startX += (bounds.maxX - bounds.minX) + TREE_GAP;
    }
  }

  const layoutedNodes = nodes.map((node) => {
    const pos = positions.get(node.id);
    return {
      ...node,
      position: pos || { x: 0, y: 0 },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// --- Wide layout (original subtreeWidth algorithm) ---

function layoutWide(
  rootId: string,
  childrenMap: Map<string, string[]>,
  positions: Map<string, { x: number; y: number }>
) {
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

  layout(rootId, 0, 0);
}

// --- Compact layout (Reingold-Tilford contour-based) ---

/** Contour: leftmost and rightmost x positions at each depth relative to subtree root */
interface Contour {
  left: number[];   // left[d] = leftmost x-center at depth d
  right: number[];  // right[d] = rightmost x-center at depth d
}

interface SubtreeResult {
  /** Relative x-offset of this subtree's root from its assigned position */
  relX: Map<string, number>;
  /** Relative y (depth * RANK_SEP) of each node */
  relY: Map<string, number>;
  contour: Contour;
}

function layoutCompact(
  rootId: string,
  childrenMap: Map<string, string[]>,
  positions: Map<string, { x: number; y: number }>
) {
  const result = computeSubtree(rootId, childrenMap);

  // Convert relative positions to absolute (root at center 0,0)
  for (const [nodeId, rx] of result.relX) {
    const ry = result.relY.get(nodeId) ?? 0;
    positions.set(nodeId, {
      x: rx - NODE_WIDTH / 2,
      y: ry,
    });
  }
}

function computeSubtree(
  nodeId: string,
  childrenMap: Map<string, string[]>
): SubtreeResult {
  const children = childrenMap.get(nodeId) || [];

  if (children.length === 0) {
    // Leaf node
    const relX = new Map<string, number>();
    const relY = new Map<string, number>();
    relX.set(nodeId, 0);
    relY.set(nodeId, 0);
    return {
      relX,
      relY,
      contour: { left: [0], right: [0] },
    };
  }

  // Recursively compute subtrees for all children
  const childResults: SubtreeResult[] = children.map((cid) =>
    computeSubtree(cid, childrenMap)
  );

  // Place children left-to-right using contour merging
  // childOffsets[i] = the x-offset of child i's root relative to parent's x
  const childOffsets: number[] = [];

  // Merged contour of all placed children so far
  let mergedContour: Contour | null = null;

  for (let i = 0; i < childResults.length; i++) {
    const childContour = childResults[i].contour;

    if (mergedContour === null) {
      // First child: place at x=0
      childOffsets.push(0);
      mergedContour = {
        left: [...childContour.left],
        right: [...childContour.right],
      };
    } else {
      // Determine minimum offset so this child doesn't overlap with already-placed children
      const sharedDepths = Math.min(mergedContour.right.length, childContour.left.length);
      let minOffset = 0;
      for (let d = 0; d < sharedDepths; d++) {
        // mergedContour.right[d] is the rightmost x at depth d of placed children
        // childContour.left[d] is the leftmost x at depth d of new child
        // We need: mergedRight + offset >= childLeft + childOffset, where
        // the gap should be at least SIBLING_GAP + NODE_WIDTH (since contours track centers)
        const needed = mergedContour.right[d] - childContour.left[d] + NODE_WIDTH + SIBLING_GAP;
        if (needed > minOffset) minOffset = needed;
      }

      childOffsets.push(minOffset);

      // Merge contours: left stays from merged, right takes max of merged or new child
      const newRight: number[] = [];
      const maxD = Math.max(mergedContour.right.length, childContour.right.length);
      for (let d = 0; d < maxD; d++) {
        const mr = d < mergedContour.right.length ? mergedContour.right[d] : -Infinity;
        const cr = d < childContour.right.length ? childContour.right[d] + minOffset : -Infinity;
        newRight.push(Math.max(mr, cr));
      }

      // Left contour: keep merged left, but extend with child's left if child is deeper
      const newLeft: number[] = [...mergedContour.left];
      for (let d = mergedContour.left.length; d < childContour.left.length; d++) {
        newLeft.push(childContour.left[d] + minOffset);
      }

      mergedContour = { left: newLeft, right: newRight };
    }
  }

  // Center the parent above the span of its children
  const firstOffset = childOffsets[0];
  const lastOffset = childOffsets[childOffsets.length - 1];
  const parentX = (firstOffset + lastOffset) / 2;

  // Shift child offsets so parent is at x=0
  const shiftedOffsets = childOffsets.map((o) => o - parentX);

  // Build combined relX/relY maps
  const relX = new Map<string, number>();
  const relY = new Map<string, number>();
  relX.set(nodeId, 0);
  relY.set(nodeId, 0);

  for (let i = 0; i < children.length; i++) {
    const childResult = childResults[i];
    const dx = shiftedOffsets[i];
    for (const [nid, rx] of childResult.relX) {
      relX.set(nid, rx + dx);
    }
    for (const [nid, ry] of childResult.relY) {
      relY.set(nid, ry + RANK_SEP);
    }
  }

  // Build contour for this subtree (relative to this node at x=0)
  const contourLeft: number[] = [0];
  const contourRight: number[] = [0];

  if (mergedContour) {
    // Shift merged contour by -parentX so it's relative to this node
    for (let d = 0; d < mergedContour.left.length; d++) {
      contourLeft.push(mergedContour.left[d] - parentX);
    }
    for (let d = 0; d < mergedContour.right.length; d++) {
      contourRight.push(mergedContour.right[d] - parentX);
    }
  }

  return { relX, relY, contour: { left: contourLeft, right: contourRight } };
}
