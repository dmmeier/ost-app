"""Tag models for Opportunity Solution Trees."""

import re
from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator

VALID_FILL_STYLES = frozenset({"none", "solid"})
_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _validate_hex_color(v: str) -> str:
    if not _HEX_COLOR_RE.match(v):
        raise ValueError(f"Color must be a 6-digit hex string like #rrggbb, got '{v}'")
    return v.lower()


def _validate_fill_style(v: str | None) -> str | None:
    if v is None:
        return v
    if v not in VALID_FILL_STYLES:
        raise ValueError(
            f"Invalid fill_style '{v}'. Must be one of: {', '.join(sorted(VALID_FILL_STYLES))}"
        )
    return v


class TagCreate(BaseModel):
    """Data required to create a tag."""

    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(default="#6b7280")
    fill_style: str | None = None
    font_light: bool = False

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str) -> str:
        return _validate_hex_color(v)

    @field_validator("fill_style")
    @classmethod
    def validate_fill_style(cls, v: str | None) -> str | None:
        return _validate_fill_style(v)


class TagUpdate(BaseModel):
    """Data for updating a tag's color and/or fill_style."""

    color: str | None = None
    fill_style: str | None = None
    font_light: bool | None = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _validate_hex_color(v)

    @field_validator("fill_style")
    @classmethod
    def validate_fill_style(cls, v: str | None) -> str | None:
        return _validate_fill_style(v)


class Tag(BaseModel):
    """A tag belonging to a project, assignable to nodes."""

    id: UUID = Field(default_factory=uuid4)
    project_id: UUID
    name: str
    color: str = "#6b7280"
    fill_style: str | None = None
    font_light: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    model_config = {"from_attributes": True}
