export type NodeType = string;
export type HypothesisType = "problem" | "solution" | "feasibility" | "desirability" | "viability";
export type FillStyle = "none" | "solid";

export const STANDARD_NODE_TYPES = ["outcome", "opportunity", "child_opportunity", "solution", "experiment"] as const;

export interface BubbleTypeDefault {
  border_color: string;
  border_width: number;
  label?: string;
  font_light?: boolean;
}

export type BubbleDefaults = Record<string, BubbleTypeDefault>;

export interface Project {
  id: string;
  name: string;
  description: string;
  project_context: string;
  bubble_defaults: BubbleDefaults | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithTrees extends Project {
  trees: Tree[];
}

export interface ProjectCreate {
  name: string;
  description?: string;
  project_context?: string;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  project_context?: string;
}

export interface Tree {
  id: string;
  project_id: string;
  name: string;
  description: string;
  tree_context: string;
  agent_knowledge: string;
  created_at: string;
  updated_at: string;
}

export interface Node {
  id: string;
  tree_id: string;
  parent_id: string | null;
  node_type: NodeType;
  title: string;
  description: string;
  status: string;
  tags: string[];
  override_border_color: string | null;
  override_border_width: number | null;
  override_fill_color: string | null;
  override_fill_style: FillStyle | null;
  override_font_light: boolean | null;
  sort_order: number;
  edge_thickness: number | null;
  assumption: string;
  evidence: string;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  project_id: string;
  name: string;
  color: string;
  fill_style: string | null;
  font_light: boolean;
  created_at: string;
}

export interface EdgeHypothesis {
  id: string;
  parent_node_id: string;
  child_node_id: string;
  hypothesis: string;
  hypothesis_type: HypothesisType;
  is_risky: boolean;
  status: string;
  evidence: string;
  thickness: number | null;
  created_at: string;
  updated_at: string;
}

export interface TreeWithNodes extends Tree {
  nodes: Node[];
  edges: EdgeHypothesis[];
}

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  rule: string;
  message: string;
  node_id?: string;
  suggestion: string;
}

export interface ValidationReport {
  tree_id: string;
  issues: ValidationIssue[];
  is_valid: boolean;
}

export interface NodeCreate {
  title: string;
  node_type: NodeType;
  parent_id?: string;
  description?: string;
  assumption?: string;
  evidence?: string;
}

export interface NodeUpdate {
  title?: string;
  description?: string;
  status?: string;
  assumption?: string;
  evidence?: string;
  edge_thickness?: number;
  override_border_color?: string | null;
  override_border_width?: number | null;
  override_fill_color?: string | null;
  override_fill_style?: string | null;
  override_font_light?: boolean | null;
}

export interface TreeCreate {
  name: string;
  description?: string;
  tree_context?: string;
  project_id: string;
}

export interface TreeUpdate {
  name?: string;
  description?: string;
  tree_context?: string;
}

export interface TreeSnapshot {
  id: string;
  tree_id: string;
  message: string;
  created_at: string;
  node_count: number;
  edge_count: number;
}

export interface SnapshotDetail {
  id: string;
  tree_id: string;
  message: string;
  created_at: string;
  snapshot_data: {
    id: string;
    name: string;
    description: string;
    tree_context: string;
    nodes: Node[];
    edges: EdgeHypothesis[];
    project_tags?: { id: string; project_id: string; name: string; color: string; fill_style: string | null }[];
    node_tags?: { node_id: string; tag_id: string }[];
  };
}

export interface ChatHistoryMessage {
  id: string;
  role: string;
  content: string;
  tool_calls?: any;
  tool_use_id?: string;
  tool_name?: string;
  mode: string;
  created_at: string;
}
