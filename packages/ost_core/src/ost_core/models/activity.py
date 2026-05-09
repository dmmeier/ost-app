"""Activity log model for tracking changes."""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class ActivityLog(BaseModel):
    """A record of a change made to a tree or node."""

    id: UUID = Field(default_factory=uuid4)
    user_id: UUID | None = None
    user_display_name: str = ""
    action: str
    resource_type: str
    resource_id: UUID | None = None
    tree_id: UUID | None = None
    project_id: UUID | None = None
    summary: str = ""
    details: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    model_config = {"from_attributes": True}
