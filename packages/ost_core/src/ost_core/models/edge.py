"""Edge hypothesis models for Opportunity Solution Trees."""

from datetime import UTC, datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class HypothesisType(str, Enum):
    PROBLEM = "problem"
    SOLUTION = "solution"
    FEASIBILITY = "feasibility"
    DESIRABILITY = "desirability"
    VIABILITY = "viability"


class EdgeHypothesisCreate(BaseModel):
    """Data required to create/set an edge hypothesis."""

    parent_node_id: UUID
    child_node_id: UUID
    hypothesis: str = Field(..., min_length=1)
    hypothesis_type: HypothesisType
    is_risky: bool = False
    evidence: str = Field(default="")
    thickness: Optional[int] = None


class EdgeHypothesisUpdate(BaseModel):
    """Fields that can be updated on an existing edge hypothesis."""

    hypothesis: Optional[str] = Field(default=None, min_length=1)
    hypothesis_type: Optional[HypothesisType] = None
    is_risky: Optional[bool] = None
    status: Optional[str] = None
    evidence: Optional[str] = None
    thickness: Optional[int] = None


class EdgeHypothesis(BaseModel):
    """An assumption/hypothesis on the edge between two nodes."""

    id: UUID = Field(default_factory=uuid4)
    parent_node_id: UUID
    child_node_id: UUID
    hypothesis: str
    hypothesis_type: HypothesisType
    is_risky: bool = False
    status: str = "untested"  # untested | validated | invalidated
    evidence: str = ""
    thickness: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    model_config = {"from_attributes": True}
