"""Validation endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ost_core.exceptions import TreeNotFoundError
from ost_core.validation import ValidationReport, TreeValidator
from ost_api.deps import get_tree_validator

router = APIRouter()


@router.post("/{tree_id}/validate", response_model=ValidationReport)
def validate_tree(
    tree_id: UUID, validator: TreeValidator = Depends(get_tree_validator)
):
    try:
        return validator.validate(tree_id)
    except TreeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tree {tree_id} not found")
