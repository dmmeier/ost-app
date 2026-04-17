"""Project endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ost_core.exceptions import ProjectNotFoundError
from ost_core.models import (
    BubbleTypeDefault,
    DEFAULT_BUBBLE_DEFAULTS,
    Project,
    ProjectCreate,
    ProjectUpdate,
    ProjectWithTrees,
)
from ost_core.services.tree_service import TreeService
from ost_api.deps import get_service

router = APIRouter()


@router.post("/", response_model=Project, status_code=201)
def create_project(data: ProjectCreate, service: TreeService = Depends(get_service)):
    return service.create_project(data)


@router.get("/", response_model=list[Project])
def list_projects(service: TreeService = Depends(get_service)):
    return service.list_projects()


@router.get("/{project_id}", response_model=ProjectWithTrees)
def get_project(project_id: UUID, service: TreeService = Depends(get_service)):
    try:
        return service.get_project_with_trees(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")


@router.patch("/{project_id}", response_model=Project)
def update_project(
    project_id: UUID, data: ProjectUpdate, service: TreeService = Depends(get_service)
):
    try:
        return service.update_project(project_id, data)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: UUID, service: TreeService = Depends(get_service)):
    try:
        service.delete_project(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")


@router.get("/{project_id}/bubble-defaults", response_model=dict[str, BubbleTypeDefault])
def get_bubble_defaults(project_id: UUID, service: TreeService = Depends(get_service)):
    """Get bubble styling defaults for a project, falling back to system defaults."""
    try:
        project = service.get_project(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")
    return project.bubble_defaults or DEFAULT_BUBBLE_DEFAULTS


@router.put("/{project_id}/bubble-defaults", response_model=Project)
def update_bubble_defaults(
    project_id: UUID,
    data: dict[str, BubbleTypeDefault],
    service: TreeService = Depends(get_service),
):
    """Replace the bubble styling defaults for a project."""
    try:
        return service.update_project(project_id, ProjectUpdate(bubble_defaults=data))
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")
