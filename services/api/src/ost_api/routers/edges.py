"""Edge hypothesis endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from ost_core.exceptions import EdgeNotFoundError, NodeNotFoundError, PermissionDeniedError
from ost_core.models import EdgeHypothesis, EdgeHypothesisCreate, EdgeHypothesisUpdate
from ost_core.models.user import User
from ost_core.services.tree_service import TreeService

from ost_api.deps import get_current_user_required, get_service

router = APIRouter()


def _check_edge_node_permission(service: TreeService, user: User | None, node_id: UUID, min_role: str) -> None:
    """Resolve project_id from node -> tree and check permission."""
    node = service.get_node(node_id)
    tree = service.get_tree(node.tree_id)
    service.check_project_permission(
        str(user.id) if user else None, str(tree.project_id), min_role
    )


@router.post("/", response_model=EdgeHypothesis, status_code=201)
def set_edge_hypothesis(
    data: EdgeHypothesisCreate, service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)
):
    try:
        _check_edge_node_permission(service, user, data.parent_node_id, "editor")
        return service.set_edge_hypothesis(data)
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except NodeNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{edge_id}", status_code=204)
def delete_edge(edge_id: UUID, service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)):
    try:
        edge = service.get_edge_by_id(edge_id)
        _check_edge_node_permission(service, user, edge.parent_node_id, "editor")
        service.delete_edge(edge_id)
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except EdgeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Edge {edge_id} not found")


@router.get("/{parent_id}/{child_id}", response_model=EdgeHypothesis | None)
def get_edge_hypothesis(
    parent_id: UUID,
    child_id: UUID,
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    try:
        _check_edge_node_permission(service, user, parent_id, "viewer")
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return service.get_edge_hypothesis(parent_id, child_id)


@router.get("/by-id/{edge_id}", response_model=EdgeHypothesis)
def get_edge_by_id(edge_id: UUID, service: TreeService = Depends(get_service), user: User | None = Depends(get_current_user_required)):
    try:
        edge = service.get_edge_by_id(edge_id)
        _check_edge_node_permission(service, user, edge.parent_node_id, "viewer")
        return edge
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except EdgeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Edge {edge_id} not found")


@router.patch("/{edge_id}", response_model=EdgeHypothesis)
def update_edge(
    edge_id: UUID,
    data: EdgeHypothesisUpdate,
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    try:
        edge = service.get_edge_by_id(edge_id)
        _check_edge_node_permission(service, user, edge.parent_node_id, "editor")
        return service.update_edge(edge_id, data)
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except EdgeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Edge {edge_id} not found")
