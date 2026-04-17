"""Project container models for grouping Opportunity Solution Trees."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from ost_core.models.tree import Tree


# Default bubble styling per node type
DEFAULT_BUBBLE_DEFAULTS: dict[str, "BubbleTypeDefault"] = {}


class BubbleTypeDefault(BaseModel):
    """Border styling defaults for a single node type."""

    border_color: str = "#93c5fd"
    border_width: float = 2.0
    label: str | None = None
    font_light: bool = False


# Now populate the module-level default after BubbleTypeDefault is defined
DEFAULT_BUBBLE_DEFAULTS = {
    "outcome": BubbleTypeDefault(border_color="#93c5fd", border_width=2.0),
    "opportunity": BubbleTypeDefault(border_color="#fdba74", border_width=2.0),
    "child_opportunity": BubbleTypeDefault(border_color="#fcd34d", border_width=2.0),
    "solution": BubbleTypeDefault(border_color="#6ee7b7", border_width=2.0),
    "experiment": BubbleTypeDefault(border_color="#c4b5fd", border_width=2.0),
}


class ProjectCreate(BaseModel):
    """Data required to create a new project."""

    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="")
    project_context: str = Field(default="")


class ProjectUpdate(BaseModel):
    """Fields that can be updated on an existing project."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    project_context: str | None = None
    bubble_defaults: dict[str, BubbleTypeDefault] | None = None


class Project(BaseModel):
    """A project that groups multiple OSTs."""

    id: UUID = Field(default_factory=uuid4)
    name: str
    description: str = ""
    project_context: str = ""
    bubble_defaults: dict[str, BubbleTypeDefault] | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    model_config = {"from_attributes": True}


class ProjectWithTrees(Project):
    """A project with all its trees loaded."""

    trees: list[Tree] = []
