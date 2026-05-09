"""Tree endpoints."""

import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from ost_core.db.repository import TreeRepository
from ost_core.exceptions import PermissionDeniedError, TreeNotFoundError, VersionConflictError
from ost_core.models import Tree, TreeCreate, TreeUpdate, TreeWithNodes
from ost_core.models.user import User
from ost_core.services.tree_service import TreeService
from pydantic import BaseModel

from ost_api.deps import get_current_user_required, get_repo, get_service

router = APIRouter()


class SnapshotCreate(BaseModel):
    message: str


class RestoreRequest(BaseModel):
    snapshot_id: str


def _check_tree_permission(service: TreeService, user: User | None, tree_id: UUID, min_role: str) -> None:
    """Resolve project_id from tree and check permission."""
    tree = service.get_tree(tree_id)
    service.check_project_permission(
        str(user.id) if user else None, str(tree.project_id), min_role
    )


@router.post("/", response_model=Tree, status_code=201)
def create_tree(data: TreeCreate, service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)):
    try:
        service.check_project_permission(
            str(user.id) if user else None, str(data.project_id), "editor"
        )
        return service.create_tree(data, user_id=str(user.id) if user else None)
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.get("/", response_model=list[Tree])
def list_trees(project_id: UUID | None = None, service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)):
    if project_id:
        try:
            service.check_project_permission(
                str(user.id) if user else None, str(project_id), "viewer"
            )
        except PermissionDeniedError as e:
            raise HTTPException(status_code=403, detail=str(e))
    return service.list_trees(project_id=project_id)


@router.get("/{tree_id}", response_model=TreeWithNodes)
def get_tree(tree_id: UUID, service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)):
    try:
        _check_tree_permission(service, user, tree_id, "viewer")
        return service.get_full_tree(tree_id)
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except TreeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tree {tree_id} not found")


@router.get("/{tree_id}/export")
def export_tree(tree_id: UUID, service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)):
    """Export a tree with full project-level styling metadata (tags, bubble_defaults)."""
    try:
        _check_tree_permission(service, user, tree_id, "viewer")
        return service.export_tree(tree_id)
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except TreeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tree {tree_id} not found")


@router.get("/{tree_id}/version")
def get_tree_version(tree_id: UUID, service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)):
    try:
        _check_tree_permission(service, user, tree_id, "viewer")
        return {"version": service.get_tree_version(tree_id)}
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except TreeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tree {tree_id} not found")


@router.patch("/{tree_id}", response_model=Tree)
def update_tree(
    tree_id: UUID, data: TreeUpdate, service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)
):
    try:
        _check_tree_permission(service, user, tree_id, "editor")
        return service.update_tree(tree_id, data, user_id=str(user.id) if user else None)
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except TreeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tree {tree_id} not found")
    except VersionConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.delete("/{tree_id}", status_code=204)
def delete_tree(tree_id: UUID, service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)):
    try:
        _check_tree_permission(service, user, tree_id, "editor")
        service.delete_tree(tree_id, user_id=str(user.id) if user else None)
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except TreeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tree {tree_id} not found")


@router.post("/import", response_model=TreeWithNodes, status_code=201)
async def import_tree(
    project_id: UUID,
    file: UploadFile,
    name: str | None = None,
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    try:
        service.check_project_permission(
            str(user.id) if user else None, str(project_id), "editor"
        )
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))

    try:
        content = await file.read()
        tree_data = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON file")

    if not isinstance(tree_data, dict) or "nodes" not in tree_data:
        raise HTTPException(status_code=400, detail="Invalid tree format: missing 'nodes' array")

    try:
        return service.import_tree(project_id, tree_data, name_override=name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")


@router.post("/{tree_id}/merge", status_code=200)
def merge_trees(
    tree_id: UUID,
    source_tree_id: UUID,
    target_parent_id: UUID,
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    try:
        _check_tree_permission(service, user, tree_id, "editor")
        service.merge_trees(source_tree_id, tree_id, target_parent_id)
        return {"status": "merged"}
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except TreeNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Snapshots (versioning) ─────────────────────────────────

@router.post("/{tree_id}/snapshots", status_code=201)
def create_snapshot(
    tree_id: UUID,
    data: SnapshotCreate,
    repo: TreeRepository = Depends(get_repo),
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    try:
        _check_tree_permission(service, user, tree_id, "editor")
        return repo.create_snapshot(tree_id, data.message, user_id=str(user.id) if user else None)
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except TreeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tree {tree_id} not found")


@router.get("/{tree_id}/snapshots")
def list_snapshots(
    tree_id: UUID,
    repo: TreeRepository = Depends(get_repo),
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    try:
        _check_tree_permission(service, user, tree_id, "viewer")
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return repo.list_snapshots(tree_id)


@router.get("/{tree_id}/snapshots/{snapshot_id}")
def get_snapshot(
    tree_id: UUID,
    snapshot_id: str,
    repo: TreeRepository = Depends(get_repo),
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    try:
        _check_tree_permission(service, user, tree_id, "viewer")
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    snapshot = repo.get_snapshot(snapshot_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snapshot


@router.post("/{tree_id}/restore", status_code=200)
def restore_snapshot(
    tree_id: UUID,
    data: RestoreRequest,
    repo: TreeRepository = Depends(get_repo),
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    try:
        _check_tree_permission(service, user, tree_id, "editor")
        repo.restore_snapshot(data.snapshot_id, user_id=str(user.id) if user else None)
        return {"status": "restored", "snapshot_id": data.snapshot_id}
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except TreeNotFoundError:
        raise HTTPException(status_code=404, detail="Snapshot not found")


# ── Chat History ───────────────────────────────────────────

@router.get("/{tree_id}/chat-history")
def get_chat_history(
    tree_id: UUID,
    limit: int = 100,
    repo: TreeRepository = Depends(get_repo),
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    try:
        _check_tree_permission(service, user, tree_id, "viewer")
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return repo.get_chat_history(tree_id, limit=limit)


@router.delete("/{tree_id}/chat-history", status_code=204)
def clear_chat_history(
    tree_id: UUID,
    repo: TreeRepository = Depends(get_repo),
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    try:
        _check_tree_permission(service, user, tree_id, "editor")
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    repo.clear_chat_history(tree_id)


# ── Activity Feed ──────────────────────────────────────────

@router.get("/{tree_id}/activity")
async def get_tree_activity(
    tree_id: UUID,
    limit: int = Query(50, ge=1, le=200),
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    """Get activity feed for a tree."""
    try:
        _check_tree_permission(service, user, tree_id, "viewer")
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except TreeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tree {tree_id} not found")
    return service.get_tree_activity(tree_id, limit=limit)
