"""Tool definitions for the OST AI chat agent.

These tool definitions are used by the chat endpoint.
They define what operations the AI can perform on the tree.
"""

from ost_core.llm.base import ToolDefinition

CHAT_TOOLS: list[ToolDefinition] = [
    ToolDefinition(
        name="get_tree",
        description="Get the full tree with all nodes, edges, and hypotheses. Always call this first to understand the current tree state before making changes.",
        parameters={
            "type": "object",
            "properties": {
                "tree_id": {"type": "string", "description": "The tree ID"},
            },
            "required": ["tree_id"],
        },
    ),
    ToolDefinition(
        name="create_project",
        description="Create a new project to group related trees.",
        parameters={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Project name"},
                "description": {"type": "string", "description": "Optional project description"},
            },
            "required": ["name"],
        },
    ),
    ToolDefinition(
        name="create_tree",
        description="Create a new tree within a project.",
        parameters={
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "The project ID to create the tree in"},
                "name": {"type": "string", "description": "Tree name"},
                "description": {"type": "string", "description": "Optional tree description"},
            },
            "required": ["project_id", "name"],
        },
    ),
    ToolDefinition(
        name="add_node",
        description=(
            "Add a node to the tree. Standard node types: outcome, opportunity, "
            "child_opportunity, solution, experiment. Custom types are also allowed. "
            "Any type can be a root node (omit parent_id for standalone/root). "
            "Multiple roots are supported — the tree can be a forest. "
            "Typical hierarchy: Outcome → Opportunity → Child Opportunity → Solution → Experiment."
        ),
        parameters={
            "type": "object",
            "properties": {
                "tree_id": {"type": "string", "description": "The tree ID"},
                "title": {"type": "string", "description": "Node title"},
                "node_type": {
                    "type": "string",
                    "description": "Type of node (e.g. outcome, opportunity, child_opportunity, solution, experiment, or custom)",
                },
                "parent_id": {"type": "string", "description": "Parent node ID (omit for standalone root)"},
                "description": {"type": "string", "description": "Optional description"},
                "assumption": {"type": "string", "description": "The assumption/hypothesis explaining why this node matters for its parent"},
                "evidence": {"type": "string", "description": "Supporting data, observations, or research findings"},
            },
            "required": ["tree_id", "title", "node_type"],
        },
    ),
    ToolDefinition(
        name="update_node",
        description="Update an existing node's title, description, assumption, or evidence.",
        parameters={
            "type": "object",
            "properties": {
                "node_id": {"type": "string", "description": "The node ID to update"},
                "title": {"type": "string", "description": "New title"},
                "description": {"type": "string", "description": "New description"},
                "assumption": {"type": "string", "description": "The assumption/hypothesis explaining why this node matters for its parent"},
                "evidence": {"type": "string", "description": "Supporting data, observations, or research findings"},
            },
            "required": ["node_id"],
        },
    ),
    ToolDefinition(
        name="remove_node",
        description="Remove a node and its entire subtree.",
        parameters={
            "type": "object",
            "properties": {
                "node_id": {"type": "string", "description": "The node ID to remove"},
            },
            "required": ["node_id"],
        },
    ),
    ToolDefinition(
        name="move_node",
        description="Move a node and its subtree to a new parent. Root nodes can also be moved (attached to another node).",
        parameters={
            "type": "object",
            "properties": {
                "node_id": {"type": "string", "description": "Node to move"},
                "new_parent_id": {"type": "string", "description": "New parent node ID"},
            },
            "required": ["node_id", "new_parent_id"],
        },
    ),
    ToolDefinition(
        name="set_edge_hypothesis",
        description=(
            "DEPRECATED: Use update_node(assumption=..., evidence=...) instead. "
            "This tool adds an assumption on the edge between two nodes (legacy). "
            "hypothesis_type: problem, solution, feasibility, desirability, viability."
        ),
        parameters={
            "type": "object",
            "properties": {
                "parent_node_id": {"type": "string"},
                "child_node_id": {"type": "string"},
                "hypothesis": {"type": "string", "description": "The assumption text"},
                "hypothesis_type": {
                    "type": "string",
                    "enum": ["problem", "solution", "feasibility", "desirability", "viability"],
                },
                "is_risky": {"type": "boolean", "description": "Whether this is a risky assumption"},
                "evidence": {"type": "string", "description": "Supporting data, observations, or research findings"},
            },
            "required": ["parent_node_id", "child_node_id", "hypothesis", "hypothesis_type"],
        },
    ),
    ToolDefinition(
        name="validate_tree",
        description="Run structural validation on the tree. Returns issues (errors, warnings) and whether the tree is valid.",
        parameters={
            "type": "object",
            "properties": {
                "tree_id": {"type": "string", "description": "The tree ID to validate"},
            },
            "required": ["tree_id"],
        },
    ),
    ToolDefinition(
        name="update_edge",
        description=(
            "DEPRECATED: Use update_node(assumption=..., evidence=...) instead. "
            "This tool updates a legacy edge hypothesis."
        ),
        parameters={
            "type": "object",
            "properties": {
                "edge_id": {"type": "string", "description": "The edge hypothesis ID to update"},
                "hypothesis": {"type": "string", "description": "New hypothesis text"},
                "hypothesis_type": {
                    "type": "string",
                    "enum": ["problem", "solution", "feasibility", "desirability", "viability"],
                    "description": "New hypothesis type",
                },
                "is_risky": {"type": "boolean", "description": "Whether this is a risky assumption"},
                "status": {
                    "type": "string",
                    "enum": ["untested", "validated", "invalidated"],
                    "description": "New status for the assumption",
                },
                "evidence": {"type": "string", "description": "Supporting data, observations, or research findings"},
            },
            "required": ["edge_id"],
        },
    ),
    ToolDefinition(
        name="update_agent_knowledge",
        description=(
            "Update your persistent knowledge notes for this tree. "
            "Use this when you learn important context during conversation: "
            "team constraints, stakeholder preferences, past decisions, product strategy, "
            "user research findings, or anything that would be valuable in future sessions. "
            "The content should be cumulative — include your prior knowledge plus new learnings. "
            "Write in concise bullet points. This replaces the previous content."
        ),
        parameters={
            "type": "object",
            "properties": {
                "tree_id": {"type": "string", "description": "The tree ID"},
                "knowledge": {
                    "type": "string",
                    "description": "The full updated knowledge notes (replaces previous content)",
                },
            },
            "required": ["tree_id", "knowledge"],
        },
    ),
    ToolDefinition(
        name="list_project_tags",
        description="List all tags available in this tree's project.",
        parameters={
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "The project ID"},
            },
            "required": ["project_id"],
        },
    ),
    ToolDefinition(
        name="add_tag_to_node",
        description="Add a tag to a node by name. Creates the tag if it doesn't exist in the project.",
        parameters={
            "type": "object",
            "properties": {
                "node_id": {"type": "string", "description": "The node ID to tag"},
                "tag_name": {"type": "string", "description": "Tag name to add"},
                "project_id": {"type": "string", "description": "The project ID"},
            },
            "required": ["node_id", "tag_name", "project_id"],
        },
    ),
    ToolDefinition(
        name="remove_tag_from_node",
        description="Remove a tag from a node.",
        parameters={
            "type": "object",
            "properties": {
                "node_id": {"type": "string", "description": "The node ID"},
                "tag_id": {"type": "string", "description": "The tag ID to remove"},
            },
            "required": ["node_id", "tag_id"],
        },
    ),
    ToolDefinition(
        name="rename_tree",
        description="Rename a tree.",
        parameters={
            "type": "object",
            "properties": {
                "tree_id": {"type": "string", "description": "The tree ID"},
                "name": {"type": "string", "description": "New name for the tree"},
            },
            "required": ["tree_id", "name"],
        },
    ),
    ToolDefinition(
        name="rename_project",
        description="Rename a project.",
        parameters={
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "The project ID"},
                "name": {"type": "string", "description": "New name for the project"},
            },
            "required": ["project_id", "name"],
        },
    ),
    ToolDefinition(
        name="add_assumption",
        description=(
            "Add a new assumption to a node. Each node can have multiple assumptions. "
            "An assumption explains why this node matters for its parent. "
            "Use this instead of update_node(assumption=...) for the new multi-assumption model."
        ),
        parameters={
            "type": "object",
            "properties": {
                "node_id": {"type": "string", "description": "The node ID to add an assumption to"},
                "text": {"type": "string", "description": "The assumption text"},
                "evidence": {"type": "string", "description": "Supporting data, observations, or research findings"},
            },
            "required": ["node_id", "text"],
        },
    ),
    ToolDefinition(
        name="update_assumption",
        description="Update an existing assumption's text, evidence, or status.",
        parameters={
            "type": "object",
            "properties": {
                "assumption_id": {"type": "string", "description": "The assumption ID to update"},
                "text": {"type": "string", "description": "New assumption text"},
                "evidence": {"type": "string", "description": "New evidence text"},
                "status": {
                    "type": "string",
                    "enum": ["untested", "confirmed", "rejected"],
                    "description": "Assumption status: untested, confirmed, or rejected",
                },
            },
            "required": ["assumption_id"],
        },
    ),
    ToolDefinition(
        name="reject_assumption",
        description="Mark an assumption as rejected. Shorthand for update_assumption(status='rejected').",
        parameters={
            "type": "object",
            "properties": {
                "assumption_id": {"type": "string", "description": "The assumption ID to reject"},
            },
            "required": ["assumption_id"],
        },
    ),
    ToolDefinition(
        name="delete_assumption",
        description="Permanently delete an assumption from a node. Use this when an assumption is no longer relevant or was created in error.",
        parameters={
            "type": "object",
            "properties": {
                "assumption_id": {"type": "string", "description": "The assumption ID to delete"},
            },
            "required": ["assumption_id"],
        },
    ),
    ToolDefinition(
        name="get_tree_filtered_by_tag",
        description="Get a tree filtered to only show nodes with the specified tag and their ancestors. Useful for focusing on a specific theme.",
        parameters={
            "type": "object",
            "properties": {
                "tree_id": {"type": "string", "description": "The tree ID"},
                "tag_name": {"type": "string", "description": "Tag name to filter by"},
            },
            "required": ["tree_id", "tag_name"],
        },
    ),
    ToolDefinition(
        name="list_skills",
        description=(
            "List available PM methodology skill guides. Returns skill names and descriptions. "
            "Use this when the user asks about frameworks, methodologies, or best practices "
            "(OKR, discovery, OST methodology, interview techniques, etc.) to see what guides are available."
        ),
        parameters={
            "type": "object",
            "properties": {},
            "required": [],
        },
    ),
    ToolDefinition(
        name="read_skill",
        description=(
            "Read the full content of a PM methodology skill guide. "
            "Call list_skills first to see available skills, then read the one that's relevant. "
            "Use the skill content to provide expert-level coaching grounded in established frameworks."
        ),
        parameters={
            "type": "object",
            "properties": {
                "skill_name": {
                    "type": "string",
                    "description": "The skill name (file stem from list_skills, e.g. 'okr', 'discovery-process')",
                },
            },
            "required": ["skill_name"],
        },
    ),
]
