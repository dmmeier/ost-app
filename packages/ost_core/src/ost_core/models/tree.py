"""Tree container models for Opportunity Solution Trees."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from ost_core.models.edge import EdgeHypothesis
from ost_core.models.node import Node


class TreeCreate(BaseModel):
    """Data required to create a new tree."""

    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="")
    tree_context: str = Field(default="")
    project_id: UUID = Field(...)


class TreeUpdate(BaseModel):
    """Fields that can be updated on an existing tree."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    tree_context: str | None = None
    agent_knowledge: str | None = None
    version: int | None = None  # For optimistic locking; when set, repo checks version match


class Tree(BaseModel):
    """An Opportunity Solution Tree container."""

    id: UUID = Field(default_factory=uuid4)
    project_id: UUID
    name: str
    description: str = ""
    tree_context: str = ""
    agent_knowledge: str = ""
    version: int = 1
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    model_config = {"from_attributes": True}


class TreeWithNodes(Tree):
    """A tree with all its nodes and edge hypotheses loaded."""

    nodes: list[Node] = []
    edges: list[EdgeHypothesis] = []
