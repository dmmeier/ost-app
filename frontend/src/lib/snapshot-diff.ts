import { create } from "jsondiffpatch";
import { NodeType } from "./types";

export type ChangeKind = "added" | "removed" | "modified";

export interface SemanticChange {
  kind: ChangeKind;
  entityType: "node" | "edge" | "tree";
  entityId?: string;
  title: string;
  nodeType?: NodeType;
  field?: string;
  oldValue?: string;
  newValue?: string;
}

interface NormalizedNode {
  id: string;
  title: string;
  description: string;
  node_type: string;
  parent_id: string | null;
  status: string;
  tags: string[];
}

interface NormalizedEdge {
  id: string;
  parent_node_id: string;
  child_node_id: string;
  hypothesis: string;
  hypothesis_type: string;
  is_risky: boolean;
  status: string;
  evidence: string;
}

interface NormalizedTree {
  name: string;
  description: string;
  tree_context: string;
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
}

function normalizeNode(n: any): NormalizedNode {
  return {
    id: n.id,
    title: n.title || "",
    description: n.description || "",
    node_type: n.node_type,
    parent_id: n.parent_id || null,
    status: n.status || "active",
    tags: [...(n.tags || [])].sort(),
  };
}

function normalizeEdge(e: any): NormalizedEdge {
  return {
    id: e.id,
    parent_node_id: e.parent_node_id,
    child_node_id: e.child_node_id,
    hypothesis: e.hypothesis || "",
    hypothesis_type: e.hypothesis_type || "problem",
    is_risky: e.is_risky ?? false,
    status: e.status || "active",
    evidence: e.evidence || "",
  };
}

function normalizeForDiff(data: any): NormalizedTree {
  const nodes = (data.nodes || []).map(normalizeNode).sort((a: NormalizedNode, b: NormalizedNode) => a.id.localeCompare(b.id));
  const edges = (data.edges || []).map(normalizeEdge).sort((a: NormalizedEdge, b: NormalizedEdge) => a.id.localeCompare(b.id));
  return {
    name: data.name || "",
    description: data.description || "",
    tree_context: data.tree_context || "",
    nodes,
    edges,
  };
}

const diffpatcher = create({
  objectHash: (obj: any) => obj.id,
  arrays: { detectMove: true },
});

const FIELD_LABELS: Record<string, string> = {
  title: "title",
  description: "description",
  node_type: "type",
  parent_id: "parent",
  status: "status",
  tags: "tags",
  hypothesis: "hypothesis",
  hypothesis_type: "hypothesis type",
  is_risky: "risky flag",
  evidence: "evidence",
  name: "name",
  tree_context: "tree context",
};

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "(none)";
  if (typeof val === "boolean") return val ? "yes" : "no";
  if (Array.isArray(val)) return val.length === 0 ? "(none)" : val.join(", ");
  const s = String(val);
  return s.length > 60 ? s.slice(0, 57) + "..." : s;
}

function buildNodeLookup(nodes: NormalizedNode[]): Map<string, NormalizedNode> {
  const map = new Map<string, NormalizedNode>();
  for (const n of nodes) map.set(n.id, n);
  return map;
}

export function computeSemanticDiff(
  beforeData: any,
  afterData: any,
): SemanticChange[] {
  const left = normalizeForDiff(beforeData);
  const right = normalizeForDiff(afterData);

  const delta = diffpatcher.diff(left, right);
  if (!delta) return [];

  const changes: SemanticChange[] = [];

  // Build lookups for resolving node titles
  const leftNodes = buildNodeLookup(left.nodes);
  const rightNodes = buildNodeLookup(right.nodes);
  const leftEdges = new Map(left.edges.map(e => [e.id, e]));
  const rightEdges = new Map(right.edges.map(e => [e.id, e]));

  // Tree-level property changes
  for (const field of ["name", "description", "tree_context"] as const) {
    const fieldDelta = (delta as any)[field];
    if (fieldDelta && Array.isArray(fieldDelta) && fieldDelta.length === 2) {
      changes.push({
        kind: "modified",
        entityType: "tree",
        title: "Tree settings",
        field: FIELD_LABELS[field] || field,
        oldValue: formatValue(fieldDelta[0]),
        newValue: formatValue(fieldDelta[1]),
      });
    }
  }

  // Node changes
  const nodesDelta = (delta as any).nodes;
  if (nodesDelta) {
    walkArrayDelta(nodesDelta, {
      onAdded: (item: NormalizedNode) => {
        changes.push({
          kind: "added",
          entityType: "node",
          entityId: item.id,
          title: item.title,
          nodeType: item.node_type as NodeType,
        });
      },
      onRemoved: (item: NormalizedNode) => {
        changes.push({
          kind: "removed",
          entityType: "node",
          entityId: item.id,
          title: item.title,
          nodeType: item.node_type as NodeType,
        });
      },
      onModified: (itemDelta: any, index: number) => {
        // Find the node by matching against left array at this index
        const node = left.nodes[index];
        if (!node) return;
        for (const field of Object.keys(itemDelta)) {
          if (field === "id" || field.startsWith("_")) continue;
          const fd = itemDelta[field];
          if (Array.isArray(fd)) {
            if (fd.length === 2) {
              changes.push({
                kind: "modified",
                entityType: "node",
                entityId: node.id,
                title: node.title,
                nodeType: node.node_type as NodeType,
                field: FIELD_LABELS[field] || field,
                oldValue: formatValue(fd[0]),
                newValue: formatValue(fd[1]),
              });
            }
          } else if (typeof fd === "object" && field === "tags") {
            // Tags array diff — summarize as old→new
            const oldTags = node.tags;
            const newNode = rightNodes.get(node.id);
            const newTags = newNode?.tags || [];
            changes.push({
              kind: "modified",
              entityType: "node",
              entityId: node.id,
              title: node.title,
              nodeType: node.node_type as NodeType,
              field: "tags",
              oldValue: formatValue(oldTags),
              newValue: formatValue(newTags),
            });
          }
        }
      },
    });
  }

  // Edge changes
  const edgesDelta = (delta as any).edges;
  if (edgesDelta) {
    walkArrayDelta(edgesDelta, {
      onAdded: (item: NormalizedEdge) => {
        const parentNode = rightNodes.get(item.parent_node_id) || leftNodes.get(item.parent_node_id);
        const childNode = rightNodes.get(item.child_node_id) || leftNodes.get(item.child_node_id);
        const label = `${parentNode?.title || "?"} → ${childNode?.title || "?"}`;
        changes.push({
          kind: "added",
          entityType: "edge",
          entityId: item.id,
          title: label,
        });
      },
      onRemoved: (item: NormalizedEdge) => {
        const parentNode = leftNodes.get(item.parent_node_id) || rightNodes.get(item.parent_node_id);
        const childNode = leftNodes.get(item.child_node_id) || rightNodes.get(item.child_node_id);
        const label = `${parentNode?.title || "?"} → ${childNode?.title || "?"}`;
        changes.push({
          kind: "removed",
          entityType: "edge",
          entityId: item.id,
          title: label,
        });
      },
      onModified: (itemDelta: any, index: number) => {
        const edge = left.edges[index];
        if (!edge) return;
        const parentNode = leftNodes.get(edge.parent_node_id) || rightNodes.get(edge.parent_node_id);
        const childNode = leftNodes.get(edge.child_node_id) || rightNodes.get(edge.child_node_id);
        const label = `${parentNode?.title || "?"} → ${childNode?.title || "?"}`;
        for (const field of Object.keys(itemDelta)) {
          if (field === "id" || field.startsWith("_") || field === "parent_node_id" || field === "child_node_id") continue;
          const fd = itemDelta[field];
          if (Array.isArray(fd) && fd.length === 2) {
            changes.push({
              kind: "modified",
              entityType: "edge",
              entityId: edge.id,
              title: label,
              field: FIELD_LABELS[field] || field,
              oldValue: formatValue(fd[0]),
              newValue: formatValue(fd[1]),
            });
          }
        }
      },
    });
  }

  return changes;
}

interface ArrayDeltaCallbacks {
  onAdded: (item: any) => void;
  onRemoved: (item: any) => void;
  onModified: (itemDelta: any, index: number) => void;
}

function walkArrayDelta(arrayDelta: any, callbacks: ArrayDeltaCallbacks) {
  // jsondiffpatch array deltas use special keys:
  // "_t": "a" marks it as an array delta
  // "N" (number key): modified item at index N (object delta of the item)
  // "_N": removed/moved item at original index N ([value, 0, 0] = removed, ["", N, 3] = moved)
  // "N": added item ([value, 0] where length is 1 means added, but also could be modified)
  if (!arrayDelta || arrayDelta._t !== "a") return;

  for (const key of Object.keys(arrayDelta)) {
    if (key === "_t") continue;

    const val = arrayDelta[key];

    if (key.startsWith("_")) {
      // Removed or moved item
      const originalIndex = parseInt(key.slice(1));
      if (Array.isArray(val) && val.length === 3 && val[1] === 0 && val[2] === 0) {
        // Removed: [originalValue, 0, 0]
        callbacks.onRemoved(val[0]);
      }
      // Moved items (val[2] === 3) — we skip these as the item appears at the new position
    } else {
      const index = parseInt(key);
      if (Array.isArray(val) && val.length === 1) {
        // Added: [newValue]
        callbacks.onAdded(val[0]);
      } else if (typeof val === "object" && !Array.isArray(val)) {
        // Modified item at this index
        callbacks.onModified(val, index);
      }
    }
  }
}
