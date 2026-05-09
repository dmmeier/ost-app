"""Repository pattern for OST data access."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import and_, delete, select
from sqlalchemy.orm import Session, sessionmaker

from ost_core.db.schema import (
    ActivityLogRow,
    ChatMessageRow,
    EdgeHypothesisRow,
    GitCommitLogRow,
    NodeClosureRow,
    NodeRow,
    NodeTagRow,
    ProjectMemberRow,
    ProjectRow,
    ProjectTagRow,
    TreeRow,
    TreeSnapshotRow,
    UserRow,
)
from ost_core.exceptions import (
    DuplicateEmailError,
    EdgeNotFoundError,
    NodeNotFoundError,
    ProjectNotFoundError,
    TreeNotFoundError,
    UserNotFoundError,
    VersionConflictError,
)
from ost_core.models import (
    BubbleTypeDefault,
    EdgeHypothesis,
    EdgeHypothesisCreate,
    EdgeHypothesisUpdate,
    GitAuthor,
    GitCommitLog,
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
)


class TreeRepository:
    def __init__(self, session_factory: sessionmaker[Session]):
        self._session_factory = session_factory

    def _session(self) -> Session:
        return self._session_factory()

    # ── Version helpers ───────────────────────────────────────

    @staticmethod
    def _bump_tree_version(session: Session, tree_id: str) -> None:
        """Increment the tree's version counter (call inside an open session)."""
        tree = session.get(TreeRow, tree_id)
        if tree:
            tree.version = (tree.version or 1) + 1
            tree.updated_at = datetime.now(UTC)

    @staticmethod
    def _check_node_version(row: NodeRow, expected: int | None) -> None:
        """Raise VersionConflictError if expected version doesn't match."""
        if expected is not None and (row.version or 1) != expected:
            raise VersionConflictError("Node", row.id, expected, row.version or 1)

    @staticmethod
    def _check_tree_version(row: TreeRow, expected: int | None) -> None:
        """Raise VersionConflictError if expected version doesn't match."""
        if expected is not None and (row.version or 1) != expected:
            raise VersionConflictError("Tree", row.id, expected, row.version or 1)

    def get_tree_version(self, tree_id: UUID) -> int:
        """Get just the version number for a tree (lightweight polling)."""
        with self._session() as session:
            row = session.get(TreeRow, str(tree_id))
            if not row:
                raise TreeNotFoundError(tree_id)
            return row.version or 1

    # ── Activity logging ───────────────────────────────────────

    @staticmethod
    def _resolve_user_name(session: Session, user_id: str | None) -> str:
        """Look up display_name from UserRow, return '' if not found."""
        if not user_id:
            return ""
        row = session.get(UserRow, user_id)
        return row.display_name if row else ""

    @staticmethod
    def _log_activity(
        session: Session,
        *,
        user_id: str | None,
        user_display_name: str,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        tree_id: str | None = None,
        project_id: str | None = None,
        summary: str = "",
        details: dict | None = None,
    ) -> None:
        """Insert an ActivityLogRow within an existing transaction."""
        session.add(ActivityLogRow(
            id=str(uuid4()),
            user_id=user_id,
            user_display_name=user_display_name,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            tree_id=tree_id,
            project_id=project_id,
            summary=summary,
            details=details,
        ))

    def list_activity(
        self,
        tree_id: UUID | None = None,
        project_id: UUID | None = None,
        limit: int = 50,
    ) -> list:
        """Read activity feed, filtered by tree_id or project_id."""
        from ost_core.models.activity import ActivityLog
        with self._session() as session:
            stmt = select(ActivityLogRow)
            if tree_id:
                stmt = stmt.where(ActivityLogRow.tree_id == str(tree_id))
            elif project_id:
                stmt = stmt.where(ActivityLogRow.project_id == str(project_id))
            stmt = stmt.order_by(ActivityLogRow.created_at.desc()).limit(limit)
            rows = session.execute(stmt).scalars().all()
            return [
                ActivityLog(
                    id=UUID(r.id),
                    user_id=UUID(r.user_id) if r.user_id else None,
                    user_display_name=r.user_display_name,
                    action=r.action,
                    resource_type=r.resource_type,
                    resource_id=UUID(r.resource_id) if r.resource_id else None,
                    tree_id=UUID(r.tree_id) if r.tree_id else None,
                    project_id=UUID(r.project_id) if r.project_id else None,
                    summary=r.summary,
                    details=r.details,
                    created_at=r.created_at,
                )
                for r in rows
            ]

    def log_activity_standalone(
        self,
        *,
        user_id: str | None,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        tree_id: str | None = None,
        project_id: str | None = None,
        summary: str = "",
        details: dict | None = None,
    ) -> None:
        """Log an activity with its own session (for use outside repo transactions)."""
        with self._session() as session:
            user_name = self._resolve_user_name(session, user_id)
            self._log_activity(
                session,
                user_id=user_id,
                user_display_name=user_name,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                tree_id=tree_id,
                project_id=project_id,
                summary=summary,
                details=details,
            )
            session.commit()

    # ── Project CRUD ──────────────────────────────────────────

    def create_project(self, data: ProjectCreate) -> Project:
        with self._session() as session:
            row = ProjectRow(
                id=str(uuid4()),
                name=data.name,
                description=data.description,
                project_context=data.project_context,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return self._project_from_row(row)

    def get_project(self, project_id: UUID) -> Project:
        with self._session() as session:
            row = session.get(ProjectRow, str(project_id))
            if not row:
                raise ProjectNotFoundError(project_id)
            return self._project_from_row(row)

    def list_projects(self) -> list[Project]:
        with self._session() as session:
            rows = session.execute(
                select(ProjectRow).order_by(ProjectRow.created_at)
            ).scalars().all()
            return [self._project_from_row(r) for r in rows]

    def update_project(self, project_id: UUID, data: ProjectUpdate) -> Project:
        with self._session() as session:
            row = session.get(ProjectRow, str(project_id))
            if not row:
                raise ProjectNotFoundError(project_id)
            if data.name is not None:
                row.name = data.name
            if data.description is not None:
                row.description = data.description
            if data.project_context is not None:
                row.project_context = data.project_context
            if data.bubble_defaults is not None:
                # Serialize BubbleTypeDefault models to plain dicts for JSON storage
                row.bubble_defaults = {
                    k: v.model_dump() for k, v in data.bubble_defaults.items()
                }
            if data.git_remote_url is not None:
                row.git_remote_url = data.git_remote_url or None  # empty string → NULL
            if data.git_branch is not None:
                row.git_branch = data.git_branch or "main"
            row.updated_at = datetime.now(UTC)
            session.commit()
            session.refresh(row)
            return self._project_from_row(row)

    def delete_project(self, project_id: UUID) -> None:
        with self._session() as session:
            row = session.get(ProjectRow, str(project_id))
            if not row:
                raise ProjectNotFoundError(project_id)
            session.delete(row)
            session.commit()

    def get_project_with_trees(self, project_id: UUID) -> ProjectWithTrees:
        with self._session() as session:
            row = session.get(ProjectRow, str(project_id))
            if not row:
                raise ProjectNotFoundError(project_id)
            project = self._project_from_row(row)
            tree_rows = session.execute(
                select(TreeRow)
                .where(TreeRow.project_id == str(project_id))
                .order_by(TreeRow.created_at)
            ).scalars().all()
            trees = [self._tree_from_row(r) for r in tree_rows]
            return ProjectWithTrees(
                id=project.id,
                name=project.name,
                description=project.description,
                project_context=project.project_context,
                bubble_defaults=project.bubble_defaults,
                git_remote_url=project.git_remote_url,
                git_branch=project.git_branch,
                created_at=project.created_at,
                updated_at=project.updated_at,
                trees=trees,
            )

    # ── Tree CRUD ──────────────────────────────────────────────

    def create_tree(self, data: TreeCreate, user_id: str | None = None) -> Tree:
        with self._session() as session:
            row = TreeRow(
                id=str(uuid4()),
                project_id=str(data.project_id),
                name=data.name,
                description=data.description,
                tree_context=data.tree_context,
            )
            if user_id:
                row.last_modified_by = user_id
            session.add(row)
            user_name = self._resolve_user_name(session, user_id)
            self._log_activity(
                session,
                user_id=user_id,
                user_display_name=user_name,
                action="tree_created",
                resource_type="tree",
                resource_id=row.id,
                tree_id=row.id,
                project_id=str(data.project_id),
                summary=f"Created tree '{data.name}'",
            )
            session.commit()
            session.refresh(row)
            return self._tree_from_row(row)

    def get_tree(self, tree_id: UUID) -> Tree:
        with self._session() as session:
            row = session.get(TreeRow, str(tree_id))
            if not row:
                raise TreeNotFoundError(tree_id)
            return self._tree_from_row(row)

    def list_trees(self, project_id: UUID | None = None) -> list[Tree]:
        with self._session() as session:
            stmt = select(TreeRow)
            if project_id is not None:
                stmt = stmt.where(TreeRow.project_id == str(project_id))
            stmt = stmt.order_by(TreeRow.created_at)
            rows = session.execute(stmt).scalars().all()
            return [self._tree_from_row(r) for r in rows]

    def update_tree(self, tree_id: UUID, data: TreeUpdate, user_id: str | None = None) -> Tree:
        with self._session() as session:
            row = session.get(TreeRow, str(tree_id))
            if not row:
                raise TreeNotFoundError(tree_id)
            self._check_tree_version(row, data.version)
            changed_fields = []
            if data.name is not None:
                changed_fields.append("name")
                row.name = data.name
            if data.description is not None:
                changed_fields.append("description")
                row.description = data.description
            if data.tree_context is not None:
                changed_fields.append("tree_context")
                row.tree_context = data.tree_context
            if data.agent_knowledge is not None:
                changed_fields.append("agent_knowledge")
                row.agent_knowledge = data.agent_knowledge
            if user_id:
                row.last_modified_by = user_id
            row.version = (row.version or 1) + 1
            row.updated_at = datetime.now(UTC)
            user_name = self._resolve_user_name(session, user_id)
            self._log_activity(
                session,
                user_id=user_id,
                user_display_name=user_name,
                action="tree_updated",
                resource_type="tree",
                resource_id=str(tree_id),
                tree_id=str(tree_id),
                project_id=row.project_id,
                summary=f"Updated tree '{row.name}'",
                details={"changed_fields": changed_fields},
            )
            session.commit()
            session.refresh(row)
            return self._tree_from_row(row)

    def delete_tree(self, tree_id: UUID, user_id: str | None = None) -> None:
        with self._session() as session:
            row = session.get(TreeRow, str(tree_id))
            if not row:
                raise TreeNotFoundError(tree_id)
            tree_name = row.name
            project_id = row.project_id
            user_name = self._resolve_user_name(session, user_id)
            self._log_activity(
                session,
                user_id=user_id,
                user_display_name=user_name,
                action="tree_deleted",
                resource_type="tree",
                resource_id=str(tree_id),
                tree_id=str(tree_id),
                project_id=project_id,
                summary=f"Deleted tree '{tree_name}'",
            )
            session.delete(row)
            session.commit()

    # ── Node CRUD ──────────────────────────────────────────────

    def add_node(self, tree_id: UUID, data: NodeCreate, user_id: str | None = None) -> Node:
        with self._session() as session:
            # Verify tree exists
            tree = session.get(TreeRow, str(tree_id))
            if not tree:
                raise TreeNotFoundError(tree_id)

            # Verify parent exists (if specified)
            if data.parent_id:
                parent = session.get(NodeRow, str(data.parent_id))
                if not parent:
                    raise NodeNotFoundError(data.parent_id)

            # Auto-assign sort_order: max sibling sort_order + 1
            sort_order = 0
            if data.parent_id:
                max_order_result = session.execute(
                    select(NodeRow.sort_order)
                    .where(NodeRow.parent_id == str(data.parent_id))
                    .order_by(NodeRow.sort_order.desc())
                ).first()
                if max_order_result:
                    sort_order = max_order_result[0] + 1
            else:
                # Root node: compute max sort_order among sibling roots
                max_order_result = session.execute(
                    select(NodeRow.sort_order)
                    .where(
                        and_(
                            NodeRow.tree_id == str(tree_id),
                            NodeRow.parent_id.is_(None),
                        )
                    )
                    .order_by(NodeRow.sort_order.desc())
                ).first()
                if max_order_result:
                    sort_order = max_order_result[0] + 1

            node_id = str(uuid4())
            row = NodeRow(
                id=node_id,
                tree_id=str(tree_id),
                parent_id=str(data.parent_id) if data.parent_id else None,
                node_type=data.node_type,
                title=data.title,
                description=data.description,
                override_border_color=data.override_border_color,
                override_border_width=data.override_border_width,
                override_fill_color=data.override_fill_color,
                override_fill_style=data.override_fill_style,
                override_font_light=data.override_font_light,
                edge_thickness=data.edge_thickness,
                sort_order=sort_order,
                assumption=data.assumption or "",
                evidence=data.evidence or "",
            )
            if user_id:
                row.last_modified_by = user_id
            session.add(row)
            session.flush()  # Flush so the node row exists before closure table FK references it

            # Maintain closure table
            self._add_closure_entries(session, node_id, str(data.parent_id) if data.parent_id else None)

            # Bump tree version
            self._bump_tree_version(session, str(tree_id))

            user_name = self._resolve_user_name(session, user_id)
            self._log_activity(
                session,
                user_id=user_id,
                user_display_name=user_name,
                action="node_created",
                resource_type="node",
                resource_id=node_id,
                tree_id=str(tree_id),
                project_id=tree.project_id,
                summary=f"Created {data.node_type} node '{data.title}'",
            )

            session.commit()
            session.refresh(row)
            return self._node_from_row(row)

    def get_node(self, node_id: UUID) -> Node:
        with self._session() as session:
            row = session.get(NodeRow, str(node_id))
            if not row:
                raise NodeNotFoundError(node_id)
            return self._node_from_row(row)

    def get_children(self, node_id: UUID) -> list[Node]:
        with self._session() as session:
            rows = (
                session.execute(
                    select(NodeRow)
                    .where(NodeRow.parent_id == str(node_id))
                    .order_by(NodeRow.sort_order, NodeRow.created_at)
                )
                .scalars()
                .all()
            )
            return [self._node_from_row(r) for r in rows]

    def update_node(self, node_id: UUID, data: NodeUpdate, user_id: str | None = None) -> Node:
        with self._session() as session:
            row = session.get(NodeRow, str(node_id))
            if not row:
                raise NodeNotFoundError(node_id)
            self._check_node_version(row, data.version)
            changed_fields = []
            if data.title is not None:
                changed_fields.append("title")
                row.title = data.title
            if data.description is not None:
                changed_fields.append("description")
                row.description = data.description
            if data.status is not None:
                changed_fields.append("status")
                row.status = data.status
            if data.node_type is not None:
                changed_fields.append("node_type")
                row.node_type = data.node_type
            # Override fields: empty string "" clears (sets to NULL), non-empty sets value
            if data.override_border_color is not None:
                row.override_border_color = data.override_border_color or None
            if data.override_border_width is not None:
                row.override_border_width = data.override_border_width or None
            if data.override_fill_color is not None:
                row.override_fill_color = data.override_fill_color or None
            if data.override_fill_style is not None:
                row.override_fill_style = data.override_fill_style or None
            if "override_font_light" in data.model_fields_set:
                row.override_font_light = data.override_font_light
            if data.edge_thickness is not None:
                row.edge_thickness = data.edge_thickness or None
            if data.assumption is not None:
                changed_fields.append("assumption")
                row.assumption = data.assumption
            if data.evidence is not None:
                changed_fields.append("evidence")
                row.evidence = data.evidence
            if user_id:
                row.last_modified_by = user_id
            row.version = (row.version or 1) + 1
            row.updated_at = datetime.now(UTC)
            # Bump tree version too
            self._bump_tree_version(session, row.tree_id)
            tree_row = session.get(TreeRow, row.tree_id)
            user_name = self._resolve_user_name(session, user_id)
            self._log_activity(
                session,
                user_id=user_id,
                user_display_name=user_name,
                action="node_updated",
                resource_type="node",
                resource_id=str(node_id),
                tree_id=row.tree_id,
                project_id=tree_row.project_id if tree_row else None,
                summary=f"Updated node '{row.title}'",
                details={"changed_fields": changed_fields},
            )
            session.commit()
            session.refresh(row)
            return self._node_from_row(row)

    def remove_node(self, node_id: UUID, cascade: bool = True, user_id: str | None = None) -> None:
        with self._session() as session:
            row = session.get(NodeRow, str(node_id))
            if not row:
                raise NodeNotFoundError(node_id)
            tree_id = row.tree_id
            node_title = row.title
            tree_row = session.get(TreeRow, tree_id)
            project_id = tree_row.project_id if tree_row else None

            user_name = self._resolve_user_name(session, user_id)
            self._log_activity(
                session,
                user_id=user_id,
                user_display_name=user_name,
                action="node_deleted",
                resource_type="node",
                resource_id=str(node_id),
                tree_id=tree_id,
                project_id=project_id,
                summary=f"Deleted node '{node_title}'",
            )

            if cascade:
                # Get all descendants via closure table and delete them
                descendant_ids = [
                    r.descendant_id
                    for r in session.execute(
                        select(NodeClosureRow.descendant_id).where(
                            and_(
                                NodeClosureRow.ancestor_id == str(node_id),
                                NodeClosureRow.depth > 0,
                            )
                        )
                    ).all()
                ]
                # Delete closure entries for all descendants
                for did in descendant_ids:
                    session.execute(
                        delete(NodeClosureRow).where(
                            (NodeClosureRow.ancestor_id == did)
                            | (NodeClosureRow.descendant_id == did)
                        )
                    )
                    session.execute(delete(NodeRow).where(NodeRow.id == did))

            # Delete closure entries for this node
            session.execute(
                delete(NodeClosureRow).where(
                    (NodeClosureRow.ancestor_id == str(node_id))
                    | (NodeClosureRow.descendant_id == str(node_id))
                )
            )
            session.delete(row)
            # Bump tree version
            self._bump_tree_version(session, tree_id)
            session.commit()

    # ── Tree queries (closure table) ───────────────────────────

    def get_subtree(self, node_id: UUID) -> list[Node]:
        """Get all descendants of a node (including the node itself)."""
        with self._session() as session:
            rows = (
                session.execute(
                    select(NodeRow)
                    .join(
                        NodeClosureRow,
                        NodeRow.id == NodeClosureRow.descendant_id,
                    )
                    .where(NodeClosureRow.ancestor_id == str(node_id))
                    .order_by(NodeClosureRow.depth)
                )
                .scalars()
                .all()
            )
            return [self._node_from_row(r) for r in rows]

    def get_ancestors(self, node_id: UUID) -> list[Node]:
        """Get all ancestors of a node (excluding the node itself), root first."""
        with self._session() as session:
            rows = (
                session.execute(
                    select(NodeRow)
                    .join(
                        NodeClosureRow,
                        NodeRow.id == NodeClosureRow.ancestor_id,
                    )
                    .where(
                        and_(
                            NodeClosureRow.descendant_id == str(node_id),
                            NodeClosureRow.depth > 0,
                        )
                    )
                    .order_by(NodeClosureRow.depth.desc())
                )
                .scalars()
                .all()
            )
            return [self._node_from_row(r) for r in rows]

    def get_depth(self, node_id: UUID) -> int:
        """Get the depth of a node in the tree (root = 0)."""
        with self._session() as session:
            result = session.execute(
                select(NodeClosureRow.depth)
                .where(
                    and_(
                        NodeClosureRow.descendant_id == str(node_id),
                        NodeClosureRow.ancestor_id != str(node_id),
                    )
                )
                .order_by(NodeClosureRow.depth.desc())
            ).first()
            if result:
                return result[0]
            return 0  # Root node

    def get_leaves(self, tree_id: UUID) -> list[Node]:
        """Get all leaf nodes (nodes with no children) in a tree."""
        with self._session() as session:
            # A leaf is a node that never appears as an ancestor_id with depth > 0
            all_nodes = (
                session.execute(
                    select(NodeRow).where(NodeRow.tree_id == str(tree_id))
                )
                .scalars()
                .all()
            )
            parent_ids = set(
                r[0]
                for r in session.execute(
                    select(NodeClosureRow.ancestor_id).where(NodeClosureRow.depth > 0)
                ).all()
            )
            return [
                self._node_from_row(n) for n in all_nodes if n.id not in parent_ids
            ]

    def get_full_tree(self, tree_id: UUID) -> TreeWithNodes:
        """Get a complete tree with all nodes and edges."""
        with self._session() as session:
            tree_row = session.get(TreeRow, str(tree_id))
            if not tree_row:
                raise TreeNotFoundError(tree_id)

            node_rows = (
                session.execute(
                    select(NodeRow)
                    .where(NodeRow.tree_id == str(tree_id))
                    .order_by(NodeRow.created_at)
                )
                .scalars()
                .all()
            )
            nodes = [self._node_from_row(r) for r in node_rows]
            node_ids = {str(n.id) for n in nodes}

            # Bulk-load tags for all nodes in this tree
            if node_ids:
                tag_rows = session.execute(
                    select(NodeTagRow.node_id, ProjectTagRow.name)
                    .join(ProjectTagRow, NodeTagRow.tag_id == ProjectTagRow.id)
                    .where(NodeTagRow.node_id.in_(node_ids))
                ).all()
                node_tag_map: dict[str, list[str]] = {}
                for node_id_str, tag_name in tag_rows:
                    node_tag_map.setdefault(node_id_str, []).append(tag_name)
                for node in nodes:
                    node.tags = node_tag_map.get(str(node.id), [])

            edge_rows = (
                session.execute(
                    select(EdgeHypothesisRow).where(
                        EdgeHypothesisRow.parent_node_id.in_(node_ids)
                    )
                )
                .scalars()
                .all()
            )
            edges = [self._edge_from_row(r) for r in edge_rows]

            # Batch-resolve last_modified_by user names
            modifier_ids = {str(n.last_modified_by) for n in nodes if n.last_modified_by}
            if tree_row.last_modified_by:
                modifier_ids.add(tree_row.last_modified_by)
            if modifier_ids:
                user_rows = session.execute(
                    select(UserRow.id, UserRow.display_name).where(UserRow.id.in_(modifier_ids))
                ).all()
                user_name_map = {uid: name for uid, name in user_rows}
                for node in nodes:
                    if node.last_modified_by:
                        node.last_modified_by_name = user_name_map.get(str(node.last_modified_by))

            tree = self._tree_from_row(tree_row)
            if tree.last_modified_by:
                tree_modifier = session.get(UserRow, str(tree.last_modified_by))
                if tree_modifier:
                    tree.last_modified_by_name = tree_modifier.display_name

            return TreeWithNodes(
                id=tree.id,
                project_id=tree.project_id,
                name=tree.name,
                description=tree.description,
                tree_context=tree.tree_context,
                agent_knowledge=tree.agent_knowledge,
                version=tree.version,
                last_modified_by=tree.last_modified_by,
                last_modified_by_name=tree.last_modified_by_name,
                created_at=tree.created_at,
                updated_at=tree.updated_at,
                nodes=nodes,
                edges=edges,
            )

    def get_root_node(self, tree_id: UUID) -> Node | None:
        """Get the first root node of a tree, or None if tree is empty."""
        with self._session() as session:
            row = (
                session.execute(
                    select(NodeRow).where(
                        and_(
                            NodeRow.tree_id == str(tree_id),
                            NodeRow.parent_id.is_(None),
                        )
                    )
                    .order_by(NodeRow.sort_order, NodeRow.created_at)
                )
                .scalars()
                .first()
            )
            return self._node_from_row(row) if row else None

    def get_root_nodes(self, tree_id: UUID) -> list[Node]:
        """Get all root nodes of a tree, ordered by sort_order then created_at."""
        with self._session() as session:
            rows = (
                session.execute(
                    select(NodeRow).where(
                        and_(
                            NodeRow.tree_id == str(tree_id),
                            NodeRow.parent_id.is_(None),
                        )
                    )
                    .order_by(NodeRow.sort_order, NodeRow.created_at)
                )
                .scalars()
                .all()
            )
            return [self._node_from_row(r) for r in rows]

    # ── Edge hypothesis CRUD ───────────────────────────────────

    def set_edge_hypothesis(self, data: EdgeHypothesisCreate) -> EdgeHypothesis:
        """Add a new edge hypothesis. Multiple assumptions per edge are allowed."""
        with self._session() as session:
            row = EdgeHypothesisRow(
                id=str(uuid4()),
                parent_node_id=str(data.parent_node_id),
                child_node_id=str(data.child_node_id),
                hypothesis=data.hypothesis,
                hypothesis_type=data.hypothesis_type.value,
                is_risky=data.is_risky,
                evidence=data.evidence,
                thickness=data.thickness,
            )
            session.add(row)
            # Bump tree version via parent node
            parent_node = session.get(NodeRow, str(data.parent_node_id))
            if parent_node:
                self._bump_tree_version(session, parent_node.tree_id)
            session.commit()
            session.refresh(row)
            return self._edge_from_row(row)

    def get_edge_hypothesis(self, parent_id: UUID, child_id: UUID) -> EdgeHypothesis | None:
        with self._session() as session:
            row = (
                session.execute(
                    select(EdgeHypothesisRow).where(
                        and_(
                            EdgeHypothesisRow.parent_node_id == str(parent_id),
                            EdgeHypothesisRow.child_node_id == str(child_id),
                        )
                    )
                )
                .scalars()
                .first()
            )
            return self._edge_from_row(row) if row else None

    def get_edge_by_id(self, edge_id: UUID) -> EdgeHypothesis:
        with self._session() as session:
            row = session.get(EdgeHypothesisRow, str(edge_id))
            if not row:
                raise EdgeNotFoundError(edge_id)
            return self._edge_from_row(row)

    def update_edge(self, edge_id: UUID, data: EdgeHypothesisUpdate) -> EdgeHypothesis:
        with self._session() as session:
            row = session.get(EdgeHypothesisRow, str(edge_id))
            if not row:
                raise EdgeNotFoundError(edge_id)
            if data.hypothesis is not None:
                row.hypothesis = data.hypothesis
            if data.hypothesis_type is not None:
                row.hypothesis_type = data.hypothesis_type.value
            if data.is_risky is not None:
                row.is_risky = data.is_risky
            if data.status is not None:
                row.status = data.status
            if data.evidence is not None:
                row.evidence = data.evidence
            if data.thickness is not None:
                row.thickness = data.thickness if data.thickness > 0 else None
            row.updated_at = datetime.now(UTC)
            # Bump tree version via parent node
            parent_node = session.get(NodeRow, row.parent_node_id)
            if parent_node:
                self._bump_tree_version(session, parent_node.tree_id)
            session.commit()
            session.refresh(row)
            return self._edge_from_row(row)

    def delete_edge(self, edge_id: UUID) -> None:
        """Delete an edge hypothesis by ID."""
        with self._session() as session:
            row = session.get(EdgeHypothesisRow, str(edge_id))
            if not row:
                raise EdgeNotFoundError(edge_id)
            # Bump tree version via parent node
            parent_node = session.get(NodeRow, row.parent_node_id)
            if parent_node:
                self._bump_tree_version(session, parent_node.tree_id)
            session.delete(row)
            session.commit()

    def get_edges_for_tree(self, tree_id: UUID) -> list[EdgeHypothesis]:
        with self._session() as session:
            node_ids = [
                r[0]
                for r in session.execute(
                    select(NodeRow.id).where(NodeRow.tree_id == str(tree_id))
                ).all()
            ]
            if not node_ids:
                return []
            rows = (
                session.execute(
                    select(EdgeHypothesisRow).where(
                        EdgeHypothesisRow.parent_node_id.in_(node_ids)
                    )
                )
                .scalars()
                .all()
            )
            return [self._edge_from_row(r) for r in rows]

    # ── Tree operations ────────────────────────────────────────

    def move_subtree(self, node_id: UUID, new_parent_id: UUID, user_id: str | None = None) -> None:
        """Move a node and its subtree to a new parent."""
        with self._session() as session:
            node = session.get(NodeRow, str(node_id))
            if not node:
                raise NodeNotFoundError(node_id)

            new_parent = session.get(NodeRow, str(new_parent_id))
            if not new_parent:
                raise NodeNotFoundError(new_parent_id)

            # Get all descendant IDs (including the node itself)
            subtree_ids = [
                r[0]
                for r in session.execute(
                    select(NodeClosureRow.descendant_id).where(
                        NodeClosureRow.ancestor_id == str(node_id)
                    )
                ).all()
            ]

            # Delete closure rows linking subtree to OLD ancestors
            # (keep internal subtree closure rows intact)
            session.execute(
                delete(NodeClosureRow).where(
                    and_(
                        NodeClosureRow.descendant_id.in_(subtree_ids),
                        ~NodeClosureRow.ancestor_id.in_(subtree_ids),
                    )
                )
            )

            # Get new ancestors (all ancestors of the new parent + new parent itself)
            new_ancestor_rows = session.execute(
                select(NodeClosureRow).where(
                    NodeClosureRow.descendant_id == str(new_parent_id)
                )
            ).scalars().all()

            # Get internal subtree closure rows
            subtree_closure_rows = session.execute(
                select(NodeClosureRow).where(
                    and_(
                        NodeClosureRow.ancestor_id == str(node_id),
                        NodeClosureRow.descendant_id.in_(subtree_ids),
                    )
                )
            ).scalars().all()

            # Cross-join: for each (new_ancestor → new_parent) and (node → descendant),
            # create (new_ancestor → descendant) with combined depth + 1
            for ancestor_row in new_ancestor_rows:
                for subtree_row in subtree_closure_rows:
                    new_depth = ancestor_row.depth + 1 + subtree_row.depth
                    session.add(
                        NodeClosureRow(
                            ancestor_id=ancestor_row.ancestor_id,
                            descendant_id=subtree_row.descendant_id,
                            depth=new_depth,
                        )
                    )

            # Update the node's parent_id
            node.parent_id = str(new_parent_id)
            if user_id:
                node.last_modified_by = user_id
            node.version = (node.version or 1) + 1
            node.updated_at = datetime.now(UTC)
            # Bump tree version
            self._bump_tree_version(session, node.tree_id)

            tree_row = session.get(TreeRow, node.tree_id)
            user_name = self._resolve_user_name(session, user_id)
            self._log_activity(
                session,
                user_id=user_id,
                user_display_name=user_name,
                action="node_moved",
                resource_type="node",
                resource_id=str(node_id),
                tree_id=node.tree_id,
                project_id=tree_row.project_id if tree_row else None,
                summary=f"Moved node '{node.title}' to new parent",
            )
            session.commit()

    def archive_subtree(self, node_id: UUID) -> None:
        """Archive a node and all its descendants."""
        with self._session() as session:
            subtree_ids = [
                r[0]
                for r in session.execute(
                    select(NodeClosureRow.descendant_id).where(
                        NodeClosureRow.ancestor_id == str(node_id)
                    )
                ).all()
            ]
            for sid in subtree_ids:
                node = session.get(NodeRow, sid)
                if node:
                    node.status = "archived"
                    node.updated_at = datetime.now(UTC)
            session.commit()

    # ── Node reordering ─────────────────────────────────────────

    def reorder_sibling(self, node_id: UUID, direction: str, user_id: str | None = None) -> None:
        """Swap a node's sort_order with its adjacent sibling.
        direction: 'left' (lower sort_order) or 'right' (higher sort_order).
        """
        with self._session() as session:
            node = session.get(NodeRow, str(node_id))
            if not node:
                raise NodeNotFoundError(node_id)

            # Get all siblings ordered by sort_order, then created_at
            if node.parent_id:
                siblings = (
                    session.execute(
                        select(NodeRow)
                        .where(NodeRow.parent_id == node.parent_id)
                        .order_by(NodeRow.sort_order, NodeRow.created_at)
                    )
                    .scalars()
                    .all()
                )
            else:
                # Root node: siblings are other roots in the same tree
                siblings = (
                    session.execute(
                        select(NodeRow)
                        .where(
                            and_(
                                NodeRow.tree_id == node.tree_id,
                                NodeRow.parent_id.is_(None),
                            )
                        )
                        .order_by(NodeRow.sort_order, NodeRow.created_at)
                    )
                    .scalars()
                    .all()
                )

            # Normalize sort_order values (0, 1, 2, ...) to handle ties
            for i, sib in enumerate(siblings):
                sib.sort_order = i

            # Find current index
            current_idx = next((i for i, s in enumerate(siblings) if s.id == str(node_id)), None)
            if current_idx is None:
                return

            # Determine swap target
            if direction == "left" and current_idx > 0:
                swap_idx = current_idx - 1
            elif direction == "right" and current_idx < len(siblings) - 1:
                swap_idx = current_idx + 1
            else:
                return  # Already at edge, nothing to do

            # Swap sort_order values
            other = siblings[swap_idx]
            node.sort_order, other.sort_order = other.sort_order, node.sort_order
            if user_id:
                node.last_modified_by = user_id
            node.version = (node.version or 1) + 1
            other.version = (other.version or 1) + 1
            node.updated_at = datetime.now(UTC)
            other.updated_at = datetime.now(UTC)
            # Bump tree version
            self._bump_tree_version(session, node.tree_id)

            tree_row = session.get(TreeRow, node.tree_id)
            user_name = self._resolve_user_name(session, user_id)
            self._log_activity(
                session,
                user_id=user_id,
                user_display_name=user_name,
                action="node_reordered",
                resource_type="node",
                resource_id=str(node_id),
                tree_id=node.tree_id,
                project_id=tree_row.project_id if tree_row else None,
                summary=f"Reordered node '{node.title}' {direction}",
            )
            session.commit()

    # ── Closure table maintenance ──────────────────────────────

    def _add_closure_entries(
        self, session: Session, node_id: str, parent_id: str | None
    ) -> None:
        """Add closure table entries for a newly added node."""
        # Self-referencing row (depth=0)
        session.add(NodeClosureRow(ancestor_id=node_id, descendant_id=node_id, depth=0))

        if parent_id:
            # For each ancestor of the parent, create a row linking that ancestor to this node
            ancestor_rows = session.execute(
                select(NodeClosureRow).where(NodeClosureRow.descendant_id == parent_id)
            ).scalars().all()

            for ar in ancestor_rows:
                session.add(
                    NodeClosureRow(
                        ancestor_id=ar.ancestor_id,
                        descendant_id=node_id,
                        depth=ar.depth + 1,
                    )
                )

    # ── Row → Model conversions ────────────────────────────────

    @staticmethod
    def _project_from_row(row: ProjectRow) -> Project:
        # Deserialize bubble_defaults from raw JSON dict to BubbleTypeDefault models
        bubble_defaults = None
        if row.bubble_defaults:
            bubble_defaults = {
                k: BubbleTypeDefault(**v) for k, v in row.bubble_defaults.items()
            }
        return Project(
            id=UUID(row.id),
            name=row.name,
            description=row.description,
            project_context=row.project_context,
            bubble_defaults=bubble_defaults,
            git_remote_url=row.git_remote_url,
            git_branch=row.git_branch or "main",
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    @staticmethod
    def _tree_from_row(row: TreeRow) -> Tree:
        return Tree(
            id=UUID(row.id),
            project_id=UUID(row.project_id),
            name=row.name,
            description=row.description,
            tree_context=row.tree_context,
            agent_knowledge=row.agent_knowledge,
            version=row.version or 1,
            last_modified_by=UUID(row.last_modified_by) if row.last_modified_by else None,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    @staticmethod
    def _node_from_row(row: NodeRow) -> Node:
        return Node(
            id=UUID(row.id),
            tree_id=UUID(row.tree_id),
            parent_id=UUID(row.parent_id) if row.parent_id else None,
            node_type=row.node_type,
            title=row.title,
            description=row.description,
            status=row.status,
            override_border_color=row.override_border_color,
            override_border_width=row.override_border_width,
            override_fill_color=row.override_fill_color,
            override_fill_style=row.override_fill_style,
            override_font_light=row.override_font_light,
            sort_order=row.sort_order,
            edge_thickness=row.edge_thickness,
            assumption=row.assumption or "",
            evidence=row.evidence or "",
            version=row.version or 1,
            last_modified_by=UUID(row.last_modified_by) if row.last_modified_by else None,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    @staticmethod
    def _edge_from_row(row: EdgeHypothesisRow) -> EdgeHypothesis:
        return EdgeHypothesis(
            id=UUID(row.id),
            parent_node_id=UUID(row.parent_node_id),
            child_node_id=UUID(row.child_node_id),
            hypothesis=row.hypothesis,
            hypothesis_type=row.hypothesis_type,
            is_risky=row.is_risky,
            status=row.status,
            evidence=row.evidence,
            thickness=row.thickness,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    # ── Tag CRUD ───────────────────────────────────────────────

    def create_tag(self, project_id: UUID, data: TagCreate) -> Tag:
        with self._session() as session:
            row = ProjectTagRow(
                id=str(uuid4()),
                project_id=str(project_id),
                name=data.name,
                color=data.color,
                fill_style=data.fill_style,
                font_light=data.font_light,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return self._tag_from_row(row)

    def list_tags(self, project_id: UUID) -> list[Tag]:
        with self._session() as session:
            rows = session.execute(
                select(ProjectTagRow)
                .where(ProjectTagRow.project_id == str(project_id))
                .order_by(ProjectTagRow.name)
            ).scalars().all()
            return [self._tag_from_row(r) for r in rows]

    def get_tag_by_name(self, project_id: UUID, name: str) -> Tag | None:
        with self._session() as session:
            row = session.execute(
                select(ProjectTagRow).where(
                    and_(
                        ProjectTagRow.project_id == str(project_id),
                        ProjectTagRow.name == name,
                    )
                )
            ).scalars().first()
            return self._tag_from_row(row) if row else None

    def get_tag_project_id(self, tag_id: UUID) -> str | None:
        """Return the project_id for a tag, or None if tag not found."""
        with self._session() as session:
            row = session.get(ProjectTagRow, str(tag_id))
            return row.project_id if row else None

    def delete_tag(self, tag_id: UUID) -> None:
        with self._session() as session:
            row = session.get(ProjectTagRow, str(tag_id))
            if row:
                session.delete(row)
                session.commit()

    def update_tag(self, tag_id: UUID, data: TagUpdate) -> Tag:
        with self._session() as session:
            row = session.get(ProjectTagRow, str(tag_id))
            if not row:
                raise ValueError(f"Tag {tag_id} not found")
            if data.color is not None:
                row.color = data.color
            if data.fill_style is not None:
                # "none" or empty string clears to NULL
                row.fill_style = data.fill_style if data.fill_style and data.fill_style != "none" else None
            if data.font_light is not None:
                row.font_light = data.font_light
            session.commit()
            session.refresh(row)
            return self._tag_from_row(row)

    def get_tag_usage_count(self, tag_id: UUID) -> int:
        with self._session() as session:
            rows = session.execute(
                select(NodeTagRow).where(NodeTagRow.tag_id == str(tag_id))
            ).scalars().all()
            return len(rows)

    def add_tag_to_node(self, node_id: UUID, tag_id: UUID, user_id: str | None = None) -> None:
        with self._session() as session:
            existing = session.execute(
                select(NodeTagRow).where(
                    and_(
                        NodeTagRow.node_id == str(node_id),
                        NodeTagRow.tag_id == str(tag_id),
                    )
                )
            ).scalars().first()
            if not existing:
                session.add(NodeTagRow(node_id=str(node_id), tag_id=str(tag_id)))
                # Bump tree version
                node_row = session.get(NodeRow, str(node_id))
                if node_row:
                    self._bump_tree_version(session, node_row.tree_id)
                    tree_row = session.get(TreeRow, node_row.tree_id)
                    tag_row = session.get(ProjectTagRow, str(tag_id))
                    tag_name = tag_row.name if tag_row else str(tag_id)
                    user_name = self._resolve_user_name(session, user_id)
                    self._log_activity(
                        session,
                        user_id=user_id,
                        user_display_name=user_name,
                        action="tag_added",
                        resource_type="node",
                        resource_id=str(node_id),
                        tree_id=node_row.tree_id,
                        project_id=tree_row.project_id if tree_row else None,
                        summary=f"Added tag '{tag_name}' to node '{node_row.title}'",
                    )
                session.commit()

    def remove_tag_from_node(self, node_id: UUID, tag_id: UUID, user_id: str | None = None) -> None:
        with self._session() as session:
            session.execute(
                delete(NodeTagRow).where(
                    and_(
                        NodeTagRow.node_id == str(node_id),
                        NodeTagRow.tag_id == str(tag_id),
                    )
                )
            )
            # Bump tree version
            node_row = session.get(NodeRow, str(node_id))
            if node_row:
                self._bump_tree_version(session, node_row.tree_id)
                tree_row = session.get(TreeRow, node_row.tree_id)
                tag_row = session.get(ProjectTagRow, str(tag_id))
                tag_name = tag_row.name if tag_row else str(tag_id)
                user_name = self._resolve_user_name(session, user_id)
                self._log_activity(
                    session,
                    user_id=user_id,
                    user_display_name=user_name,
                    action="tag_removed",
                    resource_type="node",
                    resource_id=str(node_id),
                    tree_id=node_row.tree_id,
                    project_id=tree_row.project_id if tree_row else None,
                    summary=f"Removed tag '{tag_name}' from node '{node_row.title}'",
                )
            session.commit()

    def get_node_tags(self, node_id: UUID) -> list[Tag]:
        with self._session() as session:
            rows = session.execute(
                select(ProjectTagRow)
                .join(NodeTagRow, NodeTagRow.tag_id == ProjectTagRow.id)
                .where(NodeTagRow.node_id == str(node_id))
                .order_by(ProjectTagRow.name)
            ).scalars().all()
            return [self._tag_from_row(r) for r in rows]

    @staticmethod
    def _tag_from_row(row: ProjectTagRow) -> Tag:
        return Tag(
            id=UUID(row.id),
            project_id=UUID(row.project_id),
            name=row.name,
            color=row.color,
            fill_style=row.fill_style,
            font_light=row.font_light,
            created_at=row.created_at,
        )

    # ── Chat History ─────────────────────────────────────────

    def save_chat_messages(self, tree_id: UUID, messages: list[dict], mode: str = "coach", user_id: str | None = None) -> None:
        """Save a batch of chat messages for a tree."""
        with self._session() as session:
            for msg in messages:
                # Only attach user_id to user-role messages
                msg_user_id = user_id if msg.get("role") == "user" else None
                row = ChatMessageRow(
                    id=str(uuid4()),
                    tree_id=str(tree_id),
                    role=msg.get("role", "user"),
                    content=msg.get("content") or msg.get("text") or "",
                    tool_calls=msg.get("tool_calls"),
                    tool_use_id=msg.get("tool_use_id"),
                    tool_name=msg.get("tool_name"),
                    mode=mode,
                    user_id=msg_user_id,
                )
                session.add(row)
            session.commit()

    def get_chat_history(self, tree_id: UUID, limit: int = 100) -> list[dict]:
        """Get chat messages for a tree, ordered by creation time."""
        with self._session() as session:
            rows = session.execute(
                select(ChatMessageRow)
                .where(ChatMessageRow.tree_id == str(tree_id))
                .order_by(ChatMessageRow.created_at.asc())
                .limit(limit)
            ).scalars().all()
            return [
                {
                    "id": row.id,
                    "role": row.role,
                    "content": row.content,
                    "tool_calls": row.tool_calls,
                    "tool_use_id": row.tool_use_id,
                    "tool_name": row.tool_name,
                    "mode": row.mode,
                    "user_id": row.user_id,
                    "created_at": row.created_at.isoformat(),
                }
                for row in rows
            ]

    def clear_chat_history(self, tree_id: UUID) -> None:
        """Clear all chat messages for a tree."""
        with self._session() as session:
            session.execute(
                delete(ChatMessageRow).where(ChatMessageRow.tree_id == str(tree_id))
            )
            session.commit()

    # ── Tree Snapshots ───────────────────────────────────────

    def create_snapshot(self, tree_id: UUID, message: str, user_id: str | None = None) -> dict:
        """Create a point-in-time snapshot of a tree."""
        # Get current tree state
        full_tree = self.get_full_tree(tree_id)
        snapshot_data = full_tree.model_dump(mode="json")

        # Include project tags and node-tag associations
        with self._session() as session:
            tree_row = session.get(TreeRow, str(tree_id))
            if tree_row:
                project_id = tree_row.project_id
                tag_rows = session.execute(
                    select(ProjectTagRow).where(ProjectTagRow.project_id == project_id)
                ).scalars().all()
                snapshot_data["project_tags"] = [
                    {"id": r.id, "project_id": r.project_id, "name": r.name, "color": r.color, "fill_style": r.fill_style, "font_light": r.font_light}
                    for r in tag_rows
                ]
                node_ids = [str(n.id) for n in full_tree.nodes]
                if node_ids:
                    node_tag_rows = session.execute(
                        select(NodeTagRow).where(NodeTagRow.node_id.in_(node_ids))
                    ).scalars().all()
                    snapshot_data["node_tags"] = [
                        {"node_id": r.node_id, "tag_id": r.tag_id}
                        for r in node_tag_rows
                    ]

        with self._session() as session:
            row = TreeSnapshotRow(
                id=str(uuid4()),
                tree_id=str(tree_id),
                message=message,
                snapshot_data=snapshot_data,
            )
            session.add(row)

            tree_row = session.get(TreeRow, str(tree_id))
            user_name = self._resolve_user_name(session, user_id)
            self._log_activity(
                session,
                user_id=user_id,
                user_display_name=user_name,
                action="snapshot_created",
                resource_type="snapshot",
                resource_id=row.id,
                tree_id=str(tree_id),
                project_id=tree_row.project_id if tree_row else None,
                summary=f"Created snapshot '{message}'",
            )

            session.commit()
            session.refresh(row)
            return {
                "id": row.id,
                "tree_id": row.tree_id,
                "message": row.message,
                "created_at": row.created_at.isoformat(),
                "node_count": len(full_tree.nodes),
                "edge_count": len(full_tree.edges),
            }

    def list_snapshots(self, tree_id: UUID) -> list[dict]:
        """List all snapshots for a tree."""
        with self._session() as session:
            rows = session.execute(
                select(TreeSnapshotRow)
                .where(TreeSnapshotRow.tree_id == str(tree_id))
                .order_by(TreeSnapshotRow.created_at.desc())
            ).scalars().all()
            return [
                {
                    "id": row.id,
                    "tree_id": row.tree_id,
                    "message": row.message,
                    "created_at": row.created_at.isoformat(),
                    "node_count": len(row.snapshot_data.get("nodes", [])),
                    "edge_count": len(row.snapshot_data.get("edges", [])),
                }
                for row in rows
            ]

    def get_snapshot(self, snapshot_id: str) -> dict | None:
        """Get a single snapshot with full tree data."""
        with self._session() as session:
            row = session.get(TreeSnapshotRow, snapshot_id)
            if not row:
                return None
            return {
                "id": row.id,
                "tree_id": row.tree_id,
                "message": row.message,
                "created_at": row.created_at.isoformat(),
                "snapshot_data": row.snapshot_data,
            }

    # ── Git Commit Log ───────────────────────────────────────

    def create_git_commit_log(
        self,
        project_id: UUID,
        tree_id: UUID | None,
        commit_sha: str,
        author_name: str,
        author_email: str,
        commit_message: str = "",
        file_path: str = "",
        branch: str = "main",
        remote_url: str = "",
    ) -> GitCommitLog:
        with self._session() as session:
            row = GitCommitLogRow(
                id=str(uuid4()),
                project_id=str(project_id),
                tree_id=str(tree_id) if tree_id else None,
                commit_sha=commit_sha,
                author_name=author_name,
                author_email=author_email,
                commit_message=commit_message,
                file_path=file_path,
                branch=branch,
                remote_url=remote_url,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return GitCommitLog(
                id=UUID(row.id),
                project_id=UUID(row.project_id),
                tree_id=UUID(row.tree_id) if row.tree_id else None,
                commit_sha=row.commit_sha,
                author_name=row.author_name,
                author_email=row.author_email,
                commit_message=row.commit_message,
                file_path=row.file_path,
                branch=row.branch,
                remote_url=row.remote_url,
                created_at=row.created_at,
            )

    def list_git_commit_logs(self, project_id: UUID, limit: int = 50) -> list[GitCommitLog]:
        with self._session() as session:
            rows = session.execute(
                select(GitCommitLogRow)
                .where(GitCommitLogRow.project_id == str(project_id))
                .order_by(GitCommitLogRow.created_at.desc())
                .limit(limit)
            ).scalars().all()
            return [
                GitCommitLog(
                    id=UUID(r.id),
                    project_id=UUID(r.project_id),
                    tree_id=UUID(r.tree_id) if r.tree_id else None,
                    commit_sha=r.commit_sha,
                    author_name=r.author_name,
                    author_email=r.author_email,
                    commit_message=r.commit_message,
                    file_path=r.file_path,
                    branch=r.branch,
                    remote_url=r.remote_url,
                    created_at=r.created_at,
                )
                for r in rows
            ]

    def get_git_authors(self, project_id: UUID) -> list[GitAuthor]:
        """Get distinct authors from commit history for a project."""
        with self._session() as session:
            rows = session.execute(
                select(
                    GitCommitLogRow.author_name,
                    GitCommitLogRow.author_email,
                )
                .where(GitCommitLogRow.project_id == str(project_id))
                .group_by(GitCommitLogRow.author_name, GitCommitLogRow.author_email)
                .order_by(GitCommitLogRow.author_name)
            ).all()
            return [GitAuthor(name=r[0], email=r[1]) for r in rows]

    def restore_snapshot(self, snapshot_id: str, user_id: str | None = None) -> UUID:
        """Restore a tree from a snapshot. Replaces all nodes and edges."""
        snapshot = self.get_snapshot(snapshot_id)
        if not snapshot:
            raise TreeNotFoundError(f"Snapshot {snapshot_id} not found")

        tree_id = UUID(snapshot["tree_id"])
        data = snapshot["snapshot_data"]

        with self._session() as session:
            # Delete all existing nodes (cascade deletes edges and closure)
            session.execute(
                delete(NodeRow).where(NodeRow.tree_id == str(tree_id))
            )
            session.flush()

            # Re-insert nodes (topologically sorted: parents before children)
            nodes_list = data.get("nodes", [])
            node_by_id = {n["id"]: n for n in nodes_list}
            inserted: set[str | None] = {None}  # None = no parent (root)
            sorted_nodes: list[dict] = []
            remaining = list(nodes_list)
            max_passes = len(remaining) + 1
            while remaining and max_passes > 0:
                max_passes -= 1
                next_remaining = []
                for n in remaining:
                    if n.get("parent_id") in inserted:
                        sorted_nodes.append(n)
                        inserted.add(n["id"])
                    else:
                        next_remaining.append(n)
                remaining = next_remaining

            for node_data in sorted_nodes:
                row = NodeRow(
                    id=node_data["id"],
                    tree_id=str(tree_id),
                    parent_id=node_data.get("parent_id"),
                    node_type=node_data["node_type"],
                    title=node_data["title"],
                    description=node_data.get("description", ""),
                    status=node_data.get("status", "active"),
                    override_border_color=node_data.get("override_border_color"),
                    override_border_width=node_data.get("override_border_width"),
                    override_fill_color=node_data.get("override_fill_color"),
                    override_fill_style=node_data.get("override_fill_style"),
                    override_font_light=node_data.get("override_font_light"),
                    sort_order=node_data.get("sort_order", 0),
                    edge_thickness=node_data.get("edge_thickness"),
                    assumption=node_data.get("assumption", ""),
                    evidence=node_data.get("evidence", ""),
                )
                session.add(row)
            session.flush()

            # Rebuild closure table
            for node_data in data.get("nodes", []):
                node_id = node_data["id"]
                # Self-reference
                session.add(NodeClosureRow(
                    ancestor_id=node_id,
                    descendant_id=node_id,
                    depth=0,
                ))
                # Walk up to ancestors
                current_parent = node_data.get("parent_id")
                depth = 1
                visited = set()
                while current_parent and current_parent not in visited:
                    visited.add(current_parent)
                    session.add(NodeClosureRow(
                        ancestor_id=current_parent,
                        descendant_id=node_id,
                        depth=depth,
                    ))
                    # Find this parent's parent
                    parent_data = next(
                        (n for n in data["nodes"] if n["id"] == current_parent), None
                    )
                    current_parent = parent_data.get("parent_id") if parent_data else None
                    depth += 1
            session.flush()

            # Re-insert edges
            for edge_data in data.get("edges", []):
                session.add(EdgeHypothesisRow(
                    id=edge_data["id"],
                    parent_node_id=edge_data["parent_node_id"],
                    child_node_id=edge_data["child_node_id"],
                    hypothesis=edge_data["hypothesis"],
                    hypothesis_type=edge_data["hypothesis_type"],
                    is_risky=edge_data.get("is_risky", False),
                    status=edge_data.get("status", "untested"),
                    evidence=edge_data.get("evidence", ""),
                    thickness=edge_data.get("thickness"),
                ))

            # Restore node-tag associations
            for nt_data in data.get("node_tags", []):
                # Check tag still exists (might have been deleted)
                tag_exists = session.get(ProjectTagRow, nt_data["tag_id"])
                if tag_exists:
                    session.add(NodeTagRow(
                        node_id=nt_data["node_id"],
                        tag_id=nt_data["tag_id"],
                    ))

            # Restore tag color/fill_style from snapshot
            for tag_snap in data.get("project_tags", []):
                tag_row = session.get(ProjectTagRow, tag_snap["id"])
                if tag_row:
                    tag_row.color = tag_snap.get("color", tag_row.color)
                    tag_row.fill_style = tag_snap.get("fill_style")
                    tag_row.font_light = tag_snap.get("font_light", False)

            # Update tree metadata
            tree_row = session.get(TreeRow, str(tree_id))
            if tree_row:
                if "tree_context" in data:
                    tree_row.tree_context = data.get("tree_context", "")
                    tree_row.agent_knowledge = data.get("agent_knowledge", "")
                # Bump tree version
                tree_row.version = (tree_row.version or 1) + 1
                tree_row.updated_at = datetime.now(UTC)

            user_name = self._resolve_user_name(session, user_id)
            self._log_activity(
                session,
                user_id=user_id,
                user_display_name=user_name,
                action="snapshot_restored",
                resource_type="snapshot",
                resource_id=snapshot_id,
                tree_id=str(tree_id),
                project_id=tree_row.project_id if tree_row else None,
                summary=f"Restored snapshot '{snapshot.get('message', '')}'",
            )

            session.commit()

        return tree_id

    # ── User CRUD ──────────────────────────────────────────────

    def create_user(self, email: str, display_name: str, password_hash: str) -> User:
        """Create a new user. Raises DuplicateEmailError if email taken."""
        with self._session() as session:
            existing = session.execute(
                select(UserRow).where(UserRow.email == email)
            ).scalars().first()
            if existing:
                raise DuplicateEmailError(email)

            row = UserRow(
                id=str(uuid4()),
                email=email,
                display_name=display_name,
                password_hash=password_hash,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return self._user_from_row(row)

    def get_user_by_email(self, email: str) -> tuple[User, str] | None:
        """Get a user by email. Returns (User, password_hash) or None."""
        with self._session() as session:
            row = session.execute(
                select(UserRow).where(UserRow.email == email)
            ).scalars().first()
            if not row:
                return None
            return self._user_from_row(row), row.password_hash

    def get_user_by_id(self, user_id: str) -> User:
        """Get a user by ID. Raises UserNotFoundError if not found."""
        with self._session() as session:
            row = session.get(UserRow, user_id)
            if not row:
                raise UserNotFoundError(user_id)
            return self._user_from_row(row)

    def user_count(self) -> int:
        """Return total number of registered users."""
        with self._session() as session:
            from sqlalchemy import func
            result = session.execute(select(func.count(UserRow.id)))
            return result.scalar() or 0

    # ── Project Membership ──────────────────────────────────────

    def add_project_member(self, user_id: str, project_id: str, role: str) -> None:
        """Add a user as a member of a project with the given role."""
        with self._session() as session:
            row = ProjectMemberRow(
                user_id=user_id,
                project_id=project_id,
                role=role,
            )
            session.merge(row)  # upsert in case already exists
            session.commit()

    def remove_project_member(self, user_id: str, project_id: str) -> None:
        """Remove a user from a project."""
        with self._session() as session:
            session.execute(
                delete(ProjectMemberRow).where(
                    and_(
                        ProjectMemberRow.user_id == user_id,
                        ProjectMemberRow.project_id == project_id,
                    )
                )
            )
            session.commit()

    def get_user_role(self, user_id: str, project_id: str) -> str | None:
        """Get a user's role in a project, or None if not a member."""
        with self._session() as session:
            row = session.execute(
                select(ProjectMemberRow).where(
                    and_(
                        ProjectMemberRow.user_id == user_id,
                        ProjectMemberRow.project_id == project_id,
                    )
                )
            ).scalars().first()
            return row.role if row else None

    def update_member_role(self, user_id: str, project_id: str, role: str) -> None:
        """Update a member's role in a project."""
        with self._session() as session:
            row = session.execute(
                select(ProjectMemberRow).where(
                    and_(
                        ProjectMemberRow.user_id == user_id,
                        ProjectMemberRow.project_id == project_id,
                    )
                )
            ).scalars().first()
            if row:
                row.role = role
                session.commit()

    def list_project_members(self, project_id: str) -> list[dict]:
        """List all members of a project with user details."""
        with self._session() as session:
            rows = session.execute(
                select(ProjectMemberRow, UserRow)
                .join(UserRow, ProjectMemberRow.user_id == UserRow.id)
                .where(ProjectMemberRow.project_id == project_id)
                .order_by(ProjectMemberRow.created_at)
            ).all()
            return [
                {
                    "user_id": pm.user_id,
                    "project_id": pm.project_id,
                    "role": pm.role,
                    "email": user.email,
                    "display_name": user.display_name,
                    "created_at": pm.created_at,
                }
                for pm, user in rows
            ]

    def list_user_projects(self, user_id: str) -> list[Project]:
        """List all projects the user is a member of."""
        with self._session() as session:
            rows = session.execute(
                select(ProjectRow)
                .join(ProjectMemberRow, ProjectMemberRow.project_id == ProjectRow.id)
                .where(ProjectMemberRow.user_id == user_id)
                .order_by(ProjectRow.created_at)
            ).scalars().all()
            return [self._project_from_row(r) for r in rows]

    def count_project_owners(self, project_id: str) -> int:
        """Count the number of owners of a project."""
        from sqlalchemy import func
        with self._session() as session:
            result = session.execute(
                select(func.count(ProjectMemberRow.user_id)).where(
                    and_(
                        ProjectMemberRow.project_id == project_id,
                        ProjectMemberRow.role == "owner",
                    )
                )
            )
            return result.scalar() or 0

    @staticmethod
    def _user_from_row(row: UserRow) -> User:
        from uuid import UUID as _UUID
        return User(
            id=_UUID(row.id),
            email=row.email,
            display_name=row.display_name,
            is_active=row.is_active,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

