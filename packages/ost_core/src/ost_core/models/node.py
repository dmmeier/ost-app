"""Node models for Opportunity Solution Trees."""

import re
from datetime import UTC, datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator

# NodeType is now a plain string alias (not an enum).
# Custom bubble types can be any slug-format string.
NodeType = str

# Standard types (immutable, always present)
OUTCOME = "outcome"
OPPORTUNITY = "opportunity"
CHILD_OPPORTUNITY = "child_opportunity"
SOLUTION = "solution"
EXPERIMENT = "experiment"

STANDARD_NODE_TYPES: frozenset[str] = frozenset({
    OUTCOME, OPPORTUNITY, CHILD_OPPORTUNITY, SOLUTION, EXPERIMENT,
})

_SLUG_RE = re.compile(r"^[a-z][a-z0-9_]*$")


class HypothesisSpace(str, Enum):
    PROBLEM = "problem"
    SOLUTION = "solution"


NODE_TYPE_TO_SPACE: dict[str, HypothesisSpace] = {
    OUTCOME: HypothesisSpace.PROBLEM,
    OPPORTUNITY: HypothesisSpace.PROBLEM,
    CHILD_OPPORTUNITY: HypothesisSpace.PROBLEM,
    SOLUTION: HypothesisSpace.SOLUTION,
    EXPERIMENT: HypothesisSpace.SOLUTION,
}

# Valid parent -> child type transitions in the OST structure
# Only covers standard types; custom types bypass these restrictions.
VALID_CHILD_TYPES: dict[str, list[str]] = {
    OUTCOME: [OPPORTUNITY],
    OPPORTUNITY: [CHILD_OPPORTUNITY, SOLUTION],
    CHILD_OPPORTUNITY: [CHILD_OPPORTUNITY, SOLUTION],
    SOLUTION: [EXPERIMENT],
    EXPERIMENT: [],  # Leaf nodes — no children allowed
}


def _validate_node_type_slug(v: str) -> str:
    """Validate that a node_type is a non-empty lowercase slug."""
    if not v or not isinstance(v, str):
        raise ValueError("node_type must be a non-empty string")
    v = v.strip().lower()
    if not _SLUG_RE.match(v):
        raise ValueError(
            f"node_type '{v}' must be lowercase alphanumeric with underscores, "
            "starting with a letter (e.g. 'user_story')"
        )
    return v


class NodeCreate(BaseModel):
    """Data required to create a new node."""

    title: str = Field(..., min_length=1, max_length=500)
    description: str = Field(default="")
    node_type: str
    parent_id: Optional[UUID] = None  # None only for Outcome (root)
    override_border_color: Optional[str] = None
    override_border_width: Optional[float] = None
    override_fill_color: Optional[str] = None
    override_fill_style: Optional[str] = None  # none|solid
    override_font_light: Optional[bool] = None
    edge_thickness: Optional[int] = None  # thickness of the edge to parent
    assumption: Optional[str] = None
    evidence: Optional[str] = None

    @field_validator("node_type")
    @classmethod
    def validate_node_type(cls, v: str) -> str:
        return _validate_node_type_slug(v)


class NodeUpdate(BaseModel):
    """Fields that can be updated on an existing node."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = None
    status: Optional[str] = None
    node_type: Optional[str] = None
    override_border_color: Optional[str] = None
    override_border_width: Optional[float] = None
    override_fill_color: Optional[str] = None
    override_fill_style: Optional[str] = None  # "" to clear
    override_font_light: Optional[bool] = None
    edge_thickness: Optional[int] = None  # 0 to clear
    assumption: Optional[str] = None
    evidence: Optional[str] = None

    @field_validator("node_type")
    @classmethod
    def validate_node_type(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _validate_node_type_slug(v)


class Node(BaseModel):
    """A node in the Opportunity Solution Tree."""

    id: UUID = Field(default_factory=uuid4)
    tree_id: UUID
    parent_id: Optional[UUID] = None
    node_type: str
    title: str
    description: str = ""
    status: str = "active"  # active | archived
    tags: list[str] = Field(default_factory=list)
    override_border_color: Optional[str] = None
    override_border_width: Optional[float] = None
    override_fill_color: Optional[str] = None
    override_fill_style: Optional[str] = None
    override_font_light: Optional[bool] = None
    sort_order: int = 0
    edge_thickness: Optional[int] = None
    assumption: str = ""
    evidence: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    model_config = {"from_attributes": True}

    @property
    def hypothesis_space(self) -> HypothesisSpace:
        return NODE_TYPE_TO_SPACE.get(self.node_type, HypothesisSpace.SOLUTION)

    @property
    def is_leaf_type(self) -> bool:
        valid = VALID_CHILD_TYPES.get(self.node_type)
        if valid is None:
            return False  # Custom types are not leaf types by default
        return len(valid) == 0
