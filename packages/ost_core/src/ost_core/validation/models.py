"""Validation result models."""

from enum import Enum
from uuid import UUID

from pydantic import BaseModel


class Severity(str, Enum):
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class ValidationIssue(BaseModel):
    rule: str
    severity: Severity
    message: str
    node_id: UUID | None = None
    suggestion: str = ""


class ValidationReport(BaseModel):
    tree_id: UUID
    issues: list[ValidationIssue] = []
    is_valid: bool = True
