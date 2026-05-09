"""Validation endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ost_core.exceptions import PermissionDeniedError, TreeNotFoundError
from ost_core.models.user import User
from ost_core.services.tree_service import TreeService
from ost_core.validation import ValidationReport, TreeValidator
from ost_api.deps import get_current_user_required, get_service, get_tree_validator

router = APIRouter()


@router.post("/{tree_id}/validate", response_model=ValidationReport)
def validate_tree(
    tree_id: UUID,
    validator: TreeValidator = Depends(get_tree_validator),
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    try:
        tree = service.get_tree(tree_id)
        service.check_project_permission(
            str(user.id) if user else None, str(tree.project_id), "viewer"
        )
        return validator.validate(tree_id)
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except TreeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tree {tree_id} not found")
