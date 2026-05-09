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
    """Deprecated: multiple roots are now allowed per tree (forest support)."""
    def __init__(self, tree_id: UUID):
        self.tree_id = tree_id
        super().__init__(f"Tree {tree_id} already has a root (Outcome) node")


class VersionConflictError(OSTError):
    """Raised when an update targets a stale version of an entity."""
    def __init__(self, entity_type: str, entity_id, expected: int, actual: int):
        self.entity_type = entity_type
        self.entity_id = entity_id
        self.expected_version = expected
        self.actual_version = actual
        super().__init__(
            f"{entity_type} {entity_id} was modified (expected version {expected}, "
            f"found {actual}). Refresh and try again."
        )


class AuthenticationError(OSTError):
    """Raised when authentication fails (invalid credentials or token)."""
    def __init__(self, message: str = "Invalid credentials"):
        super().__init__(message)


class DuplicateEmailError(OSTError):
    """Raised when trying to register with an already-used email."""
    def __init__(self, email: str):
        self.email = email
        super().__init__(f"Email already registered: {email}")


class PermissionDeniedError(OSTError):
    """Raised when a user lacks permission for an operation."""
    def __init__(self, message: str = "Permission denied"):
        self.message = message
        super().__init__(message)


class UserNotFoundError(OSTError):
    """Raised when a user is not found."""
    def __init__(self, user_id: str):
        self.user_id = user_id
        super().__init__(f"User not found: {user_id}")


class GitNotConfiguredError(OSTError):
    def __init__(self):
        super().__init__("Git remote URL not configured. Set OST_GIT_REMOTE_URL in .env")


class GitOperationError(OSTError):
    def __init__(self, message: str):
        super().__init__(f"Git operation failed: {message}")


class GitAuthenticationError(OSTError):
    def __init__(self, message: str = "Git authentication failed. Set GIT_TOKEN in .env for HTTPS authentication."):
        super().__init__(message)


class GitPushConflictError(OSTError):
    def __init__(self, message: str = "Push failed after retry — manual resolution required"):
        super().__init__(message)
