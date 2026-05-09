"""Project endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from ost_core.exceptions import PermissionDeniedError, ProjectNotFoundError
from ost_core.models import (
    DEFAULT_BUBBLE_DEFAULTS,
    BubbleTypeDefault,
    Project,
    ProjectCreate,
    ProjectUpdate,
    ProjectWithTrees,
)
from ost_core.models.user import User
from ost_core.services.tree_service import TreeService

from ost_api.deps import get_current_user_required, get_service

router = APIRouter()


@router.post("/", response_model=Project, status_code=201)
def create_project(data: ProjectCreate, service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)):
    return service.create_project(data, user_id=str(user.id) if user else None)


@router.get("/", response_model=list[dict])
def list_projects(service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)):
    projects = service.list_projects(user_id=str(user.id) if user else None)
    results = []
    for p in projects:
        d = p.model_dump(mode="json")
        if user and service.user_count() > 1:
            d["my_role"] = service.repo.get_user_role(str(user.id), str(p.id))
        else:
            d["my_role"] = None
        results.append(d)
    return results


@router.get("/{project_id}")
def get_project(project_id: UUID, service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)):
    try:
        service.check_project_permission(str(user.id) if user else None, str(project_id), "viewer")
        pwt = service.get_project_with_trees(project_id)
        result = pwt.model_dump(mode="json")
        # Inject my_role into the response
        if user and service.user_count() > 1:
            role = service.repo.get_user_role(str(user.id), str(project_id))
            result["my_role"] = role
        else:
            result["my_role"] = None  # open mode or single-user
        return result
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")


@router.patch("/{project_id}", response_model=Project)
def update_project(
    project_id: UUID, data: ProjectUpdate, service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)
):
    try:
        service.check_project_permission(str(user.id) if user else None, str(project_id), "editor")
        return service.update_project(project_id, data)
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: UUID, service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)):
    try:
        service.check_project_permission(str(user.id) if user else None, str(project_id), "owner")
        service.delete_project(project_id)
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")


@router.get("/{project_id}/bubble-defaults", response_model=dict[str, BubbleTypeDefault])
def get_bubble_defaults(project_id: UUID, service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)):
    """Get bubble styling defaults for a project, falling back to system defaults."""
    try:
        service.check_project_permission(str(user.id) if user else None, str(project_id), "viewer")
        project = service.get_project(project_id)
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")
    return project.bubble_defaults or DEFAULT_BUBBLE_DEFAULTS


@router.put("/{project_id}/bubble-defaults", response_model=Project)
def update_bubble_defaults(
    project_id: UUID,
    data: dict[str, BubbleTypeDefault],
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    """Replace the bubble styling defaults for a project."""
    try:
        service.check_project_permission(str(user.id) if user else None, str(project_id), "editor")
        return service.update_project(project_id, ProjectUpdate(bubble_defaults=data))
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")


# ── Activity Feed ──────────────────────────────────────────

@router.get("/{project_id}/activity")
async def get_project_activity(
    project_id: UUID,
    limit: int = Query(50, ge=1, le=200),
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    """Get activity feed for a project."""
    try:
        service.check_project_permission(str(user.id) if user else None, str(project_id), "viewer")
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")
    return service.get_project_activity(project_id, limit=limit)
