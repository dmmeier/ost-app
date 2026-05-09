"""Pydantic models for project membership and RBAC."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class ProjectMember(BaseModel):
    """A user's membership in a project with their role."""
    user_id: UUID
    project_id: UUID
    role: str  # "owner" | "editor" | "viewer"
    email: str
    display_name: str
    created_at: datetime


class AddMemberRequest(BaseModel):
    """Request to add a member to a project."""
    email: EmailStr
    role: str = Field(default="editor", pattern="^(owner|editor|viewer)$")


class UpdateMemberRequest(BaseModel):
    """Request to change a member's role."""
    role: str = Field(..., pattern="^(owner|editor|viewer)$")
