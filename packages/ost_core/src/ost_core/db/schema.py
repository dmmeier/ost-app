"""SQLAlchemy ORM models for OST database tables."""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _uuid_str() -> str:
    return str(uuid4())


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class ProjectRow(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    project_context: Mapped[str] = mapped_column(Text, default="")
    bubble_defaults: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    git_remote_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    git_branch: Mapped[str] = mapped_column(String(100), default="main")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    trees: Mapped[list["TreeRow"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class TreeRow(Base):
    __tablename__ = "trees"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    tree_context: Mapped[str] = mapped_column(Text, default="")
    agent_knowledge: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    last_modified_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    project: Mapped["ProjectRow"] = relationship(back_populates="trees")
    nodes: Mapped[list["NodeRow"]] = relationship(
        back_populates="tree", cascade="all, delete-orphan"
    )


class NodeRow(Base):
    __tablename__ = "nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tree_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trees.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("nodes.id", ondelete="CASCADE"), nullable=True
    )
    node_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="active")
    override_border_color: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    override_border_width: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    override_fill_color: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    override_fill_style: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    override_font_light: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    edge_thickness: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    edge_style: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    edge_color: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    assumption: Mapped[str] = mapped_column(Text, default="")
    evidence: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    last_modified_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    tree: Mapped["TreeRow"] = relationship(back_populates="nodes")
    parent: Mapped["NodeRow | None"] = relationship(
        remote_side="NodeRow.id", backref="children"
    )

    __table_args__ = (
        Index("ix_nodes_tree_parent", "tree_id", "parent_id"),
        Index("ix_nodes_tree_type", "tree_id", "node_type"),
    )


class NodeAssumptionRow(Base):
    __tablename__ = "node_assumptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    node_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False
    )
    text: Mapped[str] = mapped_column(Text, default="")
    evidence: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="untested")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        Index("ix_node_assumptions_node", "node_id"),
    )


class EdgeHypothesisRow(Base):
    __tablename__ = "edge_hypotheses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    parent_node_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False
    )
    child_node_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False
    )
    hypothesis: Mapped[str] = mapped_column(Text, nullable=False)
    hypothesis_type: Mapped[str] = mapped_column(String(50), nullable=False)
    is_risky: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="untested")
    evidence: Mapped[str] = mapped_column(Text, default="")
    thickness: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        Index("ix_edge_parent_child", "parent_node_id", "child_node_id"),
    )


class NodeClosureRow(Base):
    """Closure table for efficient ancestor/descendant queries."""

    __tablename__ = "node_closure"

    ancestor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True
    )
    descendant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True
    )
    depth: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        Index("ix_closure_ancestor", "ancestor_id"),
        Index("ix_closure_descendant", "descendant_id"),
    )


class ProjectTagRow(Base):
    __tablename__ = "project_tags"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(20), default="#7a6f5b")
    fill_style: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    font_light: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_project_tag_name"),
        Index("ix_project_tags_project", "project_id"),
    )


class NodeTagRow(Base):
    __tablename__ = "node_tags"

    node_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("project_tags.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class ChatMessageRow(Base):
    """Persisted chat messages per tree."""

    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tree_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trees.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user, assistant, tool_result
    content: Mapped[str] = mapped_column(Text, default="")
    tool_calls: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    tool_use_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tool_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mode: Mapped[str] = mapped_column(String(20), default="coach")
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    __table_args__ = (
        Index("ix_chat_tree_created", "tree_id", "created_at"),
    )


class TreeSnapshotRow(Base):
    """Point-in-time snapshot of a tree for versioning."""

    __tablename__ = "tree_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tree_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trees.id", ondelete="CASCADE"), nullable=False
    )
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    snapshot_data: Mapped[dict] = mapped_column(JSON, nullable=False)  # Full tree state
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    __table_args__ = (
        Index("ix_snapshot_tree_created", "tree_id", "created_at"),
    )


class UserRow(Base):
    """Registered user accounts."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        Index("ix_users_email", "email"),
    )


class ProjectMemberRow(Base):
    """Project membership with role-based access control."""

    __tablename__ = "project_members"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # "owner"|"editor"|"viewer"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    __table_args__ = (
        Index("ix_project_members_user", "user_id"),
        Index("ix_project_members_project", "project_id"),
    )


class GitCommitLogRow(Base):
    """Log of git commits made through the app."""

    __tablename__ = "git_commit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    tree_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("trees.id", ondelete="SET NULL"), nullable=True
    )
    commit_sha: Mapped[str] = mapped_column(String(64), nullable=False)
    author_name: Mapped[str] = mapped_column(String(200), nullable=False)
    author_email: Mapped[str] = mapped_column(String(200), nullable=False)
    commit_message: Mapped[str] = mapped_column(Text, default="")
    file_path: Mapped[str] = mapped_column(String(500), default="")
    branch: Mapped[str] = mapped_column(String(100), default="main")
    remote_url: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    __table_args__ = (
        Index("ix_git_commit_log_project", "project_id"),
        Index("ix_git_commit_log_project_created", "project_id", "created_at"),
    )


class ActivityLogRow(Base):
    """Activity log for tracking who changed what."""

    __tablename__ = "activity_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    user_display_name: Mapped[str] = mapped_column(String(200), default="")
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    tree_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    summary: Mapped[str] = mapped_column(Text, default="")
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    __table_args__ = (
        Index("ix_activity_log_tree_created", "tree_id", "created_at"),
        Index("ix_activity_log_project_created", "project_id", "created_at"),
        Index("ix_activity_log_user", "user_id"),
    )
