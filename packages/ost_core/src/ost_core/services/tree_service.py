"""Business logic service for Opportunity Solution Tree operations."""

from uuid import UUID

from ost_core.auth import create_token, hash_password, verify_password
from ost_core.db.repository import TreeRepository
from ost_core.exceptions import (
    AuthenticationError,
    DuplicateEmailError,
    InvalidMoveError,
    InvalidNodeTypeError,
    UserNotFoundError,
)
from ost_core.models import (
    EdgeHypothesis,
    EdgeHypothesisCreate,
    EdgeHypothesisUpdate,
    GitAuthor,
    GitCommitLog,
    HypothesisType,
    Node,
    NodeCreate,
    NodeUpdate,
    Project,
    ProjectCreate,
    ProjectUpdate,
    ProjectWithTrees,
    Tag,
    TagCreate,
    TagUpdate,
    Tree,
    TreeCreate,
    TreeUpdate,
    TreeWithNodes,
    User,
    UserCreate,
)
from ost_core.models.node import STANDARD_NODE_TYPES
from ost_core.models.project import (
    BubbleTypeDefault,
    DEFAULT_BUBBLE_DEFAULTS,
)


class TreeService:
    def __init__(self, repository: TreeRepository):
        self.repo = repository

    # ── Project operations ─────────────────────────────────────

    def create_project(self, data: ProjectCreate) -> Project:
        return self.repo.create_project(data)

    def get_project(self, project_id: UUID) -> Project:
        return self.repo.get_project(project_id)

    def list_projects(self) -> list[Project]:
        return self.repo.list_projects()

    def update_project(self, project_id: UUID, data: ProjectUpdate) -> Project:
        return self.repo.update_project(project_id, data)

    def delete_project(self, project_id: UUID) -> None:
        self.repo.delete_project(project_id)

    def get_project_with_trees(self, project_id: UUID) -> ProjectWithTrees:
        return self.repo.get_project_with_trees(project_id)

    # ── Tree operations ────────────────────────────────────────

    def create_tree(self, data: TreeCreate) -> Tree:
        return self.repo.create_tree(data)

    def get_tree(self, tree_id: UUID) -> Tree:
        return self.repo.get_tree(tree_id)

    def list_trees(self, project_id: UUID | None = None) -> list[Tree]:
        return self.repo.list_trees(project_id=project_id)

    def update_tree(self, tree_id: UUID, data: TreeUpdate) -> Tree:
        return self.repo.update_tree(tree_id, data)

    def delete_tree(self, tree_id: UUID) -> None:
        self.repo.delete_tree(tree_id)

    def get_tree_version(self, tree_id: UUID) -> int:
        """Get just the version number for a tree (lightweight polling)."""
        return self.repo.get_tree_version(tree_id)

    def get_full_tree(self, tree_id: UUID) -> TreeWithNodes:
        return self.repo.get_full_tree(tree_id)

    # ── Node operations ────────────────────────────────────────

    def add_node(self, tree_id: UUID, data: NodeCreate) -> Node:
        """Add a node to the tree. Any type can be a root; multiple roots allowed."""
        if data.parent_id is not None:
            self.repo.get_node(data.parent_id)  # verify parent exists
        node = self.repo.add_node(tree_id, data)

        # Auto-register custom bubble types in the project's bubble_defaults
        if data.node_type not in STANDARD_NODE_TYPES:
            tree = self.repo.get_tree(tree_id)
            project = self.repo.get_project(tree.project_id)
            current_defaults = dict(project.bubble_defaults or DEFAULT_BUBBLE_DEFAULTS)
            if data.node_type not in current_defaults:
                current_defaults[data.node_type] = BubbleTypeDefault()
                self.repo.update_project(
                    project.id,
                    ProjectUpdate(bubble_defaults=current_defaults),
                )

        return node

    def get_node(self, node_id: UUID) -> Node:
        return self.repo.get_node(node_id)

    def get_children(self, node_id: UUID) -> list[Node]:
        return self.repo.get_children(node_id)

    def update_node(self, node_id: UUID, data: NodeUpdate) -> Node:
        return self.repo.update_node(node_id, data)

    def remove_node(self, node_id: UUID, cascade: bool = True) -> None:
        self.repo.remove_node(node_id, cascade=cascade)

    def get_subtree(self, node_id: UUID) -> list[Node]:
        return self.repo.get_subtree(node_id)

    def get_ancestors(self, node_id: UUID) -> list[Node]:
        return self.repo.get_ancestors(node_id)

    def get_leaves(self, tree_id: UUID) -> list[Node]:
        return self.repo.get_leaves(tree_id)

    # ── Move subtree ───────────────────────────────────────────

    def move_subtree(self, node_id: UUID, new_parent_id: UUID) -> None:
        """Move a node and its subtree to a new parent, with validation."""
        node = self.repo.get_node(node_id)
        new_parent = self.repo.get_node(new_parent_id)

        # Can't move to self
        if node_id == new_parent_id:
            raise InvalidMoveError("Cannot move a node to itself")

        # Can't move across trees
        if str(node.tree_id) != str(new_parent.tree_id):
            raise InvalidMoveError("Cannot move a node to a different tree")

        # Can't move to a descendant (would create a cycle)
        subtree = self.repo.get_subtree(node_id)
        subtree_ids = {n.id for n in subtree}
        if new_parent_id in subtree_ids:
            raise InvalidMoveError("Cannot move a node to one of its own descendants")

        self.repo.move_subtree(node_id, new_parent_id)

    # ── Node reordering ─────────────────────────────────────────

    def reorder_sibling(self, node_id: UUID, direction: str) -> None:
        """Move a node left or right among its siblings."""
        if direction not in ("left", "right"):
            raise ValueError(f"Invalid direction: {direction}. Must be 'left' or 'right'.")
        self.repo.reorder_sibling(node_id, direction)

    # ── Edge hypothesis operations ─────────────────────────────

    def set_edge_hypothesis(self, data: EdgeHypothesisCreate) -> EdgeHypothesis:
        return self.repo.set_edge_hypothesis(data)

    def get_edge_hypothesis(self, parent_id: UUID, child_id: UUID) -> EdgeHypothesis | None:
        return self.repo.get_edge_hypothesis(parent_id, child_id)

    def get_edge_by_id(self, edge_id: UUID) -> EdgeHypothesis:
        return self.repo.get_edge_by_id(edge_id)

    def update_edge(self, edge_id: UUID, data: EdgeHypothesisUpdate) -> EdgeHypothesis:
        return self.repo.update_edge(edge_id, data)

    def delete_edge(self, edge_id: UUID) -> None:
        return self.repo.delete_edge(edge_id)

    def get_edges_for_tree(self, tree_id: UUID) -> list[EdgeHypothesis]:
        return self.repo.get_edges_for_tree(tree_id)

    # ── Export tree to JSON ──────────────────────────────────

    def export_tree(self, tree_id: UUID) -> dict:
        """Export tree with full project-level styling metadata.

        Returns a dict suitable for JSON serialization that includes:
        - All node data (including overrides, edge_thickness, sort_order, tags)
        - project_tags: tag definitions with colors, fill styles, font_light
        - bubble_defaults: project bubble type defaults
        - project_context: project-level context text
        """
        full_tree = self.get_full_tree(tree_id)
        data = full_tree.model_dump(mode="json")

        tree = self.get_tree(tree_id)
        project = self.get_project(tree.project_id)

        # Add project_context
        if project.project_context:
            data["project_context"] = project.project_context

        # Add bubble_defaults
        if project.bubble_defaults:
            data["bubble_defaults"] = {
                k: v.model_dump() for k, v in project.bubble_defaults.items()
            }

        # Add tag definitions
        tags = self.list_tags(tree.project_id)
        data["project_tags"] = [
            {
                "name": t.name,
                "color": t.color,
                "fill_style": t.fill_style,
                "font_light": t.font_light,
            }
            for t in tags
        ]

        return data

    # ── Import tree from JSON ─────────────────────────────────

    def import_tree(
        self, project_id: UUID, tree_data: dict, name_override: str | None = None
    ) -> TreeWithNodes:
        """Import a tree from exported JSON data (TreeWithNodes format).

        Creates a fresh tree with new IDs, recreating the node hierarchy,
        edge hypotheses, tags, and project-level styling using an old→new
        ID mapping.  Backwards-compatible with old exports that lack
        project_tags / bubble_defaults keys.
        """
        from collections import deque

        # Create new tree
        tree_name = name_override or tree_data.get("name", "Imported Tree")
        new_tree = self.create_tree(
            TreeCreate(
                name=tree_name,
                description=tree_data.get("description", ""),
                tree_context=tree_data.get("tree_context", ""),
                project_id=project_id,
            )
        )

        # Update agent_knowledge if present
        agent_knowledge = tree_data.get("agent_knowledge")
        if agent_knowledge:
            self.update_tree(new_tree.id, TreeUpdate(agent_knowledge=agent_knowledge))

        # ── Restore project_context if present and project has none ──
        imported_project_context = tree_data.get("project_context")
        if imported_project_context:
            project = self.get_project(project_id)
            if not project.project_context:
                self.update_project(project_id, ProjectUpdate(project_context=imported_project_context))

        # ── Restore bubble_defaults (imported values take precedence) ──
        imported_defaults = tree_data.get("bubble_defaults")
        if imported_defaults:
            project = self.get_project(project_id)
            current = dict(project.bubble_defaults or {})
            for k, v in imported_defaults.items():
                current[k] = BubbleTypeDefault(**(v if isinstance(v, dict) else v.model_dump()))
            self.update_project(project_id, ProjectUpdate(bubble_defaults=current))

        # ── Restore project tags ──
        from ost_core.models.tag import VALID_FILL_STYLES

        for tag_data in tree_data.get("project_tags", []):
            existing = self.get_tag_by_name(project_id, tag_data["name"])
            if not existing:
                # Sanitize fill_style: drop values not in VALID_FILL_STYLES
                raw_fill = tag_data.get("fill_style")
                fill_style = raw_fill if raw_fill in VALID_FILL_STYLES else None
                self.create_tag(
                    project_id,
                    TagCreate(
                        name=tag_data["name"],
                        color=tag_data.get("color", "#6b7280"),
                        fill_style=fill_style,
                        font_light=tag_data.get("font_light", False),
                    ),
                )

        nodes = tree_data.get("nodes", [])
        edges = tree_data.get("edges", [])

        if not nodes:
            return self.get_full_tree(new_tree.id)

        # Build old_id → new_id mapping via BFS
        id_map: dict[str, UUID] = {}

        # Build children lookup from source data, sorted by sort_order
        # to preserve sibling ordering on import
        children_of: dict[str | None, list[dict]] = {}
        for n in nodes:
            parent_key = str(n["parent_id"]) if n.get("parent_id") else None
            children_of.setdefault(parent_key, []).append(n)

        # Sort each sibling group by sort_order to preserve ordering
        for key in children_of:
            children_of[key].sort(key=lambda nd: (nd.get("sort_order", 0), str(nd.get("created_at", ""))))

        # BFS starting from root (parent_id=None)
        queue: deque[str | None] = deque([None])
        while queue:
            parent_key = queue.popleft()
            for node_data in children_of.get(parent_key, []):
                old_id = str(node_data["id"])
                mapped_parent = id_map[parent_key] if parent_key else None

                new_node = self.add_node(
                    new_tree.id,
                    NodeCreate(
                        title=node_data["title"],
                        description=node_data.get("description", ""),
                        node_type=node_data["node_type"],
                        parent_id=mapped_parent,
                        assumption=node_data.get("assumption", ""),
                        evidence=node_data.get("evidence", ""),
                        override_border_color=node_data.get("override_border_color"),
                        override_border_width=node_data.get("override_border_width"),
                        override_fill_color=node_data.get("override_fill_color"),
                        override_fill_style=node_data.get("override_fill_style"),
                        override_font_light=node_data.get("override_font_light"),
                        edge_thickness=node_data.get("edge_thickness"),
                    ),
                )
                id_map[old_id] = new_node.id
                queue.append(old_id)

                # Restore node status if archived
                node_status = node_data.get("status")
                if node_status and node_status != "active":
                    self.update_node(new_node.id, NodeUpdate(status=node_status))

        # ── Restore node tags ──
        for node_data in nodes:
            old_id = str(node_data["id"])
            new_node_id = id_map.get(old_id)
            if new_node_id:
                for tag_name in node_data.get("tags", []):
                    self.add_tag_to_node_by_name(new_node_id, tag_name, project_id)

        # Recreate edges using mapped IDs
        for edge_data in edges:
            old_parent = str(edge_data["parent_node_id"])
            old_child = str(edge_data["child_node_id"])
            if old_parent in id_map and old_child in id_map:
                edge = self.set_edge_hypothesis(
                    EdgeHypothesisCreate(
                        parent_node_id=id_map[old_parent],
                        child_node_id=id_map[old_child],
                        hypothesis=edge_data["hypothesis"],
                        hypothesis_type=HypothesisType(edge_data["hypothesis_type"]),
                        is_risky=edge_data.get("is_risky", False),
                        evidence=edge_data.get("evidence", ""),
                        thickness=edge_data.get("thickness"),
                    )
                )
                # Restore edge status if not default
                edge_status = edge_data.get("status")
                if edge_status and edge_status != "untested":
                    self.update_edge(
                        edge.id,
                        EdgeHypothesisUpdate(status=edge_status),
                    )

        return self.get_full_tree(new_tree.id)

    # ── Merge trees ────────────────────────────────────────────

    def merge_trees(
        self, source_tree_id: UUID, target_tree_id: UUID, target_parent_id: UUID
    ) -> None:
        """Merge source tree's root subtrees under a target parent node.

        Copies all root nodes and their children from the source tree
        into the target tree under the specified parent node.
        """
        source_roots = self.repo.get_root_nodes(source_tree_id)
        if not source_roots:
            return  # Empty tree, nothing to merge

        # Get the target parent to validate it exists
        self.repo.get_node(target_parent_id)

        for root in source_roots:
            self._copy_subtree(root, target_tree_id, target_parent_id)

    def _copy_subtree(self, node: Node, target_tree_id: UUID, new_parent_id: UUID) -> None:
        """Recursively copy a node and its descendants into a target tree."""
        # Create the node copy in the target tree
        new_node = self.repo.add_node(
            target_tree_id,
            NodeCreate(
                title=node.title,
                description=node.description,
                node_type=node.node_type,
                parent_id=new_parent_id,
                assumption=node.assumption,
                evidence=node.evidence,
            ),
        )

        # Recurse for children
        children = self.repo.get_children(node.id)
        for child in children:
            self._copy_subtree(child, target_tree_id, new_node.id)

    # ── Tag operations ────────────────────────────────────────

    def create_tag(self, project_id: UUID, data: TagCreate) -> Tag:
        return self.repo.create_tag(project_id, data)

    def list_tags(self, project_id: UUID) -> list[Tag]:
        return self.repo.list_tags(project_id)

    def get_tag_by_name(self, project_id: UUID, name: str) -> Tag | None:
        return self.repo.get_tag_by_name(project_id, name)

    def delete_tag(self, tag_id: UUID) -> None:
        self.repo.delete_tag(tag_id)

    def update_tag(self, tag_id: UUID, data: TagUpdate) -> Tag:
        return self.repo.update_tag(tag_id, data)

    def get_tag_usage_count(self, tag_id: UUID) -> int:
        return self.repo.get_tag_usage_count(tag_id)

    def add_tag_to_node(self, node_id: UUID, tag_id: UUID) -> None:
        self.repo.add_tag_to_node(node_id, tag_id)

    def remove_tag_from_node(self, node_id: UUID, tag_id: UUID) -> None:
        self.repo.remove_tag_from_node(node_id, tag_id)

    def add_tag_to_node_by_name(self, node_id: UUID, tag_name: str, project_id: UUID) -> Tag:
        """Create-if-not-exists + assign. Single operation for UX convenience."""
        tag = self.repo.get_tag_by_name(project_id, tag_name)
        if not tag:
            tag = self.repo.create_tag(project_id, TagCreate(name=tag_name))
        self.repo.add_tag_to_node(node_id, tag.id)
        return tag

    def get_tree_filtered_by_tag(self, tree_id: UUID, tag_name: str) -> TreeWithNodes:
        """Get full tree but only include nodes that are tagged or are ancestors of tagged nodes."""
        full_tree = self.repo.get_full_tree(tree_id)

        # Find nodes with the tag
        tagged_node_ids = {str(n.id) for n in full_tree.nodes if tag_name in n.tags}

        if not tagged_node_ids:
            # Return tree with no nodes
            return TreeWithNodes(
                id=full_tree.id,
                project_id=full_tree.project_id,
                name=full_tree.name,
                description=full_tree.description,
                tree_context=full_tree.tree_context,
                agent_knowledge=full_tree.agent_knowledge,
                created_at=full_tree.created_at,
                updated_at=full_tree.updated_at,
                nodes=[],
                edges=[],
            )

        # Walk up parent_id chains to collect all ancestors
        node_map = {str(n.id): n for n in full_tree.nodes}
        visible_ids = set(tagged_node_ids)
        for nid in tagged_node_ids:
            current = node_map.get(nid)
            while current and current.parent_id:
                pid = str(current.parent_id)
                if pid in visible_ids:
                    break
                visible_ids.add(pid)
                current = node_map.get(pid)

        visible_nodes = [n for n in full_tree.nodes if str(n.id) in visible_ids]
        visible_edges = [
            e for e in full_tree.edges
            if str(e.parent_node_id) in visible_ids and str(e.child_node_id) in visible_ids
        ]

        return TreeWithNodes(
            id=full_tree.id,
            project_id=full_tree.project_id,
            name=full_tree.name,
            description=full_tree.description,
            tree_context=full_tree.tree_context,
            agent_knowledge=full_tree.agent_knowledge,
            created_at=full_tree.created_at,
            updated_at=full_tree.updated_at,
            nodes=visible_nodes,
            edges=visible_edges,
        )

    # ── Git Commit Log ────────────────────────────────────────

    def create_git_commit_log(self, **kwargs) -> GitCommitLog:
        return self.repo.create_git_commit_log(**kwargs)

    def list_git_commit_logs(self, project_id: UUID, limit: int = 50) -> list[GitCommitLog]:
        return self.repo.list_git_commit_logs(project_id, limit=limit)

    def get_git_authors(self, project_id: UUID) -> list[GitAuthor]:
        return self.repo.get_git_authors(project_id)

    # ── Archive ────────────────────────────────────────────────

    def archive_subtree(self, node_id: UUID) -> None:
        self.repo.archive_subtree(node_id)

    # ── Auth operations ───────────────────────────────────────

    def register(self, data: UserCreate) -> tuple[User, str]:
        """Register a new user. Returns (User, token)."""
        import re
        if not re.match(r"[^@]+@[^@]+\.[^@]+", data.email):
            raise AuthenticationError("Invalid email format")

        pw_hash = hash_password(data.password)
        user = self.repo.create_user(data.email, data.display_name, pw_hash)
        token = create_token(str(user.id))
        return user, token

    def login(self, email: str, password: str) -> tuple[User, str]:
        """Authenticate a user. Returns (User, token)."""
        result = self.repo.get_user_by_email(email)
        if not result:
            raise AuthenticationError("Invalid email or password")
        user, pw_hash = result
        if not verify_password(password, pw_hash):
            raise AuthenticationError("Invalid email or password")
        token = create_token(str(user.id))
        return user, token

    def get_user(self, user_id: str) -> User:
        """Get a user by ID."""
        return self.repo.get_user_by_id(user_id)

    def user_count(self) -> int:
        """Return the total number of registered users."""
        return self.repo.user_count()
