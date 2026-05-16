import { Node as RFNode, Edge as RFEdge } from "@xyflow/react";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 100;
const SIBLING_GAP = 40;
const RANK_SEP = NODE_HEIGHT + 80;
const TREE_GAP = 3 * SIBLING_GAP;

// Expanded (detail) view dimensions
const EXPANDED_NODE_WIDTH = 480;
const EXPANDED_NODE_HEIGHT = 320;
const EXPANDED_SIBLING_GAP = 60;
const EXPANDED_RANK_SEP = EXPANDED_NODE_HEIGHT + 100;
const EXPANDED_TREE_GAP = 3 * EXPANDED_SIBLING_GAP;

// Minimum vertical gap between the bottom of a parent and top of its children
const MIN_GAP = 40;

// --- Height estimation ---

interface NodeHeightData {
  title?: string;
  description?: string;
  nodeDescription?: string;
  status?: string;
  tags?: string[];
  assumptionCount?: number;
  assumptions?: { text?: string; evidence?: string; status?: string }[];
  expanded?: boolean;
}

/**
 * Estimate the rendered pixel height of a node from its data.
 * Intentionally conservative (slightly overestimates) to prevent overlaps.
 */
function estimateNodeHeight(data: NodeHeightData, expanded: boolean): number {
  if (expanded) {
    return estimateExpandedHeight(data);
  }
  return estimateCompactHeight(data);
}

function estimateCompactHeight(data: NodeHeightData): number {
  let h = 0;

  // Border: default 2px top + 2px bottom
  h += 4;

  // Vertical padding: py-3 = 12px top + 12px bottom
  h += 24;

  // Handle space (target handle above, source handle below)
  h += 6;

  // Title: text-[18px] font-semibold leading-snug, line-clamp-3
  // Max width ~200px effective (260 - 32px padding - 32px index badge space)
  // ~14 chars per line at 18px semibold in a 200px box
  const title = data.title || "";
  const titleLines = Math.min(Math.ceil(title.length / 14), 3);
  h += titleLines * 25;

  // Status badge: mt-1, text-[10px], py-0.5 → ~22px when present
  if (data.status && data.status !== "active") {
    h += 22;
  }

  // Description: text-xs mt-1 line-clamp-2
  // ~28 chars per line at 12px in ~228px width
  // Account for markdown line breaks (bullet lists render as separate lines)
  const desc = data.description || "";
  if (desc.trim()) {
    const charBasedLines = Math.ceil(desc.length / 28);
    const newlineBasedLines = (desc.match(/\n/g) || []).length + 1;
    const descLines = Math.min(Math.max(charBasedLines, newlineBasedLines), 2);
    h += descLines * 16 + 4; // 16px line height + 4px margin
  }

  // Tags: mt-1.5, up to 3 shown + overflow indicator, ~26px row
  const tags = data.tags || [];
  if (tags.length > 0) {
    h += 26;
  }

  // Assumption indicator: mt-1.5, ~22px
  const assumptionCount = data.assumptionCount ?? 0;
  if (assumptionCount > 0) {
    h += 22;
  }

  return h;
}

function estimateExpandedHeight(data: NodeHeightData): number {
  let h = 0;

  // Border: default 2px top + 2px bottom
  h += 4;

  // Header: type badge + status row — px-4 pt-3 pb-1 → ~40px
  h += 40;

  // Title: text-[18px] font-semibold leading-snug, px-4 pb-1
  // Width ~420px (460 - 40px padding), ~26 chars per line
  const title = data.title || "";
  const titleLines = Math.ceil(title.length / 26) || 1;
  h += titleLines * 25 + 4;

  const desc = data.nodeDescription || data.description || "";
  const tags = data.tags || [];
  const assumptions = data.assumptions || [];
  const filledAssumptions = assumptions.filter(
    (a) => (a.text || "").trim() || (a.evidence || "").trim()
  );

  const hasContent = desc.trim() || tags.length > 0 || filledAssumptions.length > 0;

  // Divider: mx-4 mb-2 border-t → 12px
  if (hasContent) {
    h += 12;
  }

  // Description: label 18px + text lines + pb-2
  // ~42 chars per line at 11px in ~420px width (no line-clamp in expanded view)
  // Account for markdown: newlines produce separate lines/list items
  if (desc.trim()) {
    h += 18; // "Description" label
    const charBasedLines = Math.ceil(desc.length / 42) || 1;
    const newlineBasedLines = (desc.match(/\n/g) || []).length + 1;
    const descLines = Math.max(charBasedLines, newlineBasedLines);
    h += descLines * 18 + 8; // text + padding
  }

  // Tags: all shown, flex-wrap gap-1 px-4 pb-2
  // ~4 tags per row (conservative for longer tag names)
  if (tags.length > 0) {
    const tagRows = Math.ceil(tags.length / 4);
    h += tagRows * 22 + 8;
  }

  // Assumptions section
  if (filledAssumptions.length > 0) {
    h += 28; // header row with counts + mb-1.5
    // Each assumption card: status header ~20px, 2-col content ~42px, padding ~12px = ~74px
    h += filledAssumptions.length * 78;
    // Inter-card gaps: space-y-1.5 = 6px between each card
    h += (filledAssumptions.length - 1) * 6;
    h += 16; // section bottom padding (pb-4)
  }

  // Bottom handle space
  h += 8;

  return h;
}

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
  compact: boolean = false,
  expanded: boolean = false
): { nodes: RFNode[]; edges: RFEdge[] } {
  if (nodes.length === 0) return { nodes, edges };

  // Select dimensions based on expanded mode
  const nw = expanded ? EXPANDED_NODE_WIDTH : NODE_WIDTH;
  const nh = expanded ? EXPANDED_NODE_HEIGHT : NODE_HEIGHT;
  const sg = expanded ? EXPANDED_SIBLING_GAP : SIBLING_GAP;
  const rs = expanded ? EXPANDED_RANK_SEP : RANK_SEP;
  const tg = expanded ? EXPANDED_TREE_GAP : TREE_GAP;

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

  // Build height map: estimate rendered height for each node
  const nodeHeightMap = new Map<string, number>();
  for (const node of nodes) {
    const d = node.data as NodeHeightData;
    nodeHeightMap.set(node.id, estimateNodeHeight(d, expanded));
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
      layoutCompact(roots[0].id, childrenMap, positions, nw, sg, rs, nodeHeightMap);
    } else {
      layoutWide(roots[0].id, childrenMap, positions, nw, sg, rs, nodeHeightMap);
    }
  } else {
    // Multiple roots: layout each subtree independently, then arrange side by side
    const subtreePositions: Map<string, { x: number; y: number }>[] = [];
    const subtreeBounds: { minX: number; maxX: number; minY: number; maxY: number }[] = [];

    for (const root of roots) {
      const subPos = new Map<string, { x: number; y: number }>();
      if (compact) {
        layoutCompact(root.id, childrenMap, subPos, nw, sg, rs, nodeHeightMap);
      } else {
        layoutWide(root.id, childrenMap, subPos, nw, sg, rs, nodeHeightMap);
      }
      subtreePositions.push(subPos);

      // Compute bounding box of this subtree
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [nodeId, pos] of subPos) {
        if (pos.x < minX) minX = pos.x;
        if (pos.x + nw > maxX) maxX = pos.x + nw;
        if (pos.y < minY) minY = pos.y;
        const nodeH = nodeHeightMap.get(nodeId) ?? nh;
        if (pos.y + nodeH > maxY) maxY = pos.y + nodeH;
      }
      subtreeBounds.push({ minX, maxX, minY, maxY });
    }

    // Arrange subtrees side by side
    const totalWidth =
      subtreeBounds.reduce((sum, b) => sum + (b.maxX - b.minX), 0) +
      (subtreeBounds.length - 1) * tg;
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

      startX += (bounds.maxX - bounds.minX) + tg;
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
  positions: Map<string, { x: number; y: number }>,
  nw: number = NODE_WIDTH,
  sg: number = SIBLING_GAP,
  rs: number = RANK_SEP,
  nodeHeightMap: Map<string, number> = new Map()
) {
  const subtreeWidthCache = new Map<string, number>();

  function subtreeWidth(nodeId: string): number {
    if (subtreeWidthCache.has(nodeId)) return subtreeWidthCache.get(nodeId)!;
    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) {
      subtreeWidthCache.set(nodeId, nw);
      return nw;
    }
    const total =
      children.reduce((sum, cid) => sum + subtreeWidth(cid), 0) +
      (children.length - 1) * sg;
    const width = Math.max(nw, total);
    subtreeWidthCache.set(nodeId, width);
    return width;
  }

  function layout(nodeId: string, centerX: number, y: number) {
    positions.set(nodeId, {
      x: centerX - nw / 2,
      y,
    });
    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) return;

    // Content-aware rank separation: ensure enough gap below this node
    const parentHeight = nodeHeightMap.get(nodeId) ?? 0;
    const effectiveRs = Math.max(rs, parentHeight + MIN_GAP);

    const totalChildrenWidth =
      children.reduce((sum, cid) => sum + subtreeWidth(cid), 0) +
      (children.length - 1) * sg;

    let leftEdge = centerX - totalChildrenWidth / 2;
    for (const childId of children) {
      const childTreeWidth = subtreeWidth(childId);
      const childCenterX = leftEdge + childTreeWidth / 2;
      layout(childId, childCenterX, y + effectiveRs);
      leftEdge += childTreeWidth + sg;
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
  /** Relative y of each node (content-aware, not just depth * RANK_SEP) */
  relY: Map<string, number>;
  contour: Contour;
}

function layoutCompact(
  rootId: string,
  childrenMap: Map<string, string[]>,
  positions: Map<string, { x: number; y: number }>,
  nw: number = NODE_WIDTH,
  sg: number = SIBLING_GAP,
  rs: number = RANK_SEP,
  nodeHeightMap: Map<string, number> = new Map()
) {
  const result = computeSubtree(rootId, childrenMap, nw, sg, rs, nodeHeightMap);

  // Convert relative positions to absolute (root at center 0,0)
  for (const [nodeId, rx] of result.relX) {
    const ry = result.relY.get(nodeId) ?? 0;
    positions.set(nodeId, {
      x: rx - nw / 2,
      y: ry,
    });
  }
}

function computeSubtree(
  nodeId: string,
  childrenMap: Map<string, string[]>,
  nw: number = NODE_WIDTH,
  sg: number = SIBLING_GAP,
  rs: number = RANK_SEP,
  nodeHeightMap: Map<string, number> = new Map()
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

  // Content-aware rank separation for this parent node
  const parentHeight = nodeHeightMap.get(nodeId) ?? 0;
  const effectiveRs = Math.max(rs, parentHeight + MIN_GAP);

  // Recursively compute subtrees for all children
  const childResults: SubtreeResult[] = children.map((cid) =>
    computeSubtree(cid, childrenMap, nw, sg, rs, nodeHeightMap)
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
        const needed = mergedContour.right[d] - childContour.left[d] + nw + sg;
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
      relY.set(nid, ry + effectiveRs);
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
