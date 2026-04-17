"""Custom exceptions for OST operations."""

from uuid import UUID


class OSTError(Exception):
    """Base exception for OST operations."""


class TreeNotFoundError(OSTError):
    def __init__(self, tree_id: UUID):
        self.tree_id = tree_id
        super().__init__(f"Tree not found: {tree_id}")


class NodeNotFoundError(OSTError):
    def __init__(self, node_id: UUID):
        self.node_id = node_id
        super().__init__(f"Node not found: {node_id}")


class EdgeNotFoundError(OSTError):
    def __init__(self, edge_id: UUID):
        self.edge_id = edge_id
        super().__init__(f"Edge hypothesis not found: {edge_id}")


class InvalidNodeTypeError(OSTError):
    def __init__(self, parent_type: str, child_type: str):
        self.parent_type = parent_type
        self.child_type = child_type
        super().__init__(
            f"Cannot add {child_type} as child of {parent_type}. "
            f"Check VALID_CHILD_TYPES for allowed transitions."
        )


class InvalidMoveError(OSTError):
    def __init__(self, reason: str):
        super().__init__(f"Invalid move: {reason}")


class MergeConflictError(OSTError):
    def __init__(self, reason: str):
        super().__init__(f"Merge conflict: {reason}")


class ProjectNotFoundError(OSTError):
    def __init__(self, project_id: UUID):
        self.project_id = project_id
        super().__init__(f"Project not found: {project_id}")


class TagNotFoundError(OSTError):
    def __init__(self, tag_id: UUID):
        self.tag_id = tag_id
        super().__init__(f"Tag not found: {tag_id}")


class DuplicateRootError(OSTError):
    def __init__(self, tree_id: UUID):
        self.tree_id = tree_id
        super().__init__(f"Tree {tree_id} already has a root (Outcome) node")
