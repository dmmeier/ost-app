"""Project membership endpoints for RBAC."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ost_core.exceptions import PermissionDeniedError, UserNotFoundError
from ost_core.models.member import AddMemberRequest, ProjectMember, UpdateMemberRequest
from ost_core.models.user import User
from ost_core.services.tree_service import TreeService
from ost_api.deps import get_current_user_required, get_service

router = APIRouter()


@router.get("/projects/{project_id}/members", response_model=list[ProjectMember])
def list_members(
    project_id: UUID,
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    """List all members of a project (viewer+)."""
    try:
        service.check_project_permission(
            str(user.id) if user else None, str(project_id), "viewer"
        )
        return service.list_members(str(project_id))
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post("/projects/{project_id}/members", response_model=ProjectMember, status_code=201)
def add_member(
    project_id: UUID,
    data: AddMemberRequest,
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    """Add a member to a project (owner only)."""
    try:
        return service.add_member(
            str(user.id) if user else None, str(project_id), data.email, data.role
        )
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except UserNotFoundError:
        raise HTTPException(status_code=404, detail=f"User with email '{data.email}' not found")


@router.patch("/projects/{project_id}/members/{member_user_id}", status_code=200)
def update_member_role(
    project_id: UUID,
    member_user_id: UUID,
    data: UpdateMemberRequest,
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    """Change a member's role (owner only)."""
    try:
        service.update_member_role(
            str(user.id) if user else None, str(project_id), str(member_user_id), data.role
        )
        return {"status": "updated", "user_id": str(member_user_id), "role": data.role}
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.delete("/projects/{project_id}/members/{member_user_id}", status_code=204)
def remove_member(
    project_id: UUID,
    member_user_id: UUID,
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    """Remove a member from a project (owner only)."""
    try:
        service.remove_member(
            str(user.id) if user else None, str(project_id), str(member_user_id)
        )
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
