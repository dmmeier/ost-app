"""Pydantic models for git commit logging and author tracking."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class GitCommitLog(BaseModel):
    """Record of a git commit made through the app."""

    id: UUID = Field(default_factory=uuid4)
    project_id: UUID
    tree_id: UUID | None = None
    commit_sha: str
    author_name: str
    author_email: str
    commit_message: str = ""
    file_path: str = ""
    branch: str = "main"
    remote_url: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class GitAuthor(BaseModel):
    """A distinct author from commit history."""

    name: str
    email: str


class GitProjectConfig(BaseModel):
    """Git configuration for a project."""

    remote_url: str | None = None
    branch: str = "main"
    token_configured: bool = False
