"""Node endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ost_core.exceptions import (
    InvalidMoveError,
    InvalidNodeTypeError,
    NodeNotFoundError,
    TreeNotFoundError,
    VersionConflictError,
)
from ost_core.models import Node, NodeCreate, NodeUpdate
from ost_core.services.tree_service import TreeService
from ost_api.deps import get_service

router = APIRouter()


@router.post("/", response_model=Node, status_code=201)
def add_node(
    tree_id: UUID, data: NodeCreate, service: TreeService = Depends(get_service)
):
    try:
        return service.add_node(tree_id, data)
    except TreeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tree {tree_id} not found")
    except NodeNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidNodeTypeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{node_id}", response_model=Node)
def get_node(node_id: UUID, service: TreeService = Depends(get_service)):
    try:
        return service.get_node(node_id)
    except NodeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")


@router.patch("/{node_id}", response_model=Node)
def update_node(
    node_id: UUID, data: NodeUpdate, service: TreeService = Depends(get_service)
):
    try:
        return service.update_node(node_id, data)
    except NodeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    except InvalidNodeTypeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except VersionConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.delete("/{node_id}", status_code=204)
def remove_node(
    node_id: UUID,
    cascade: bool = True,
    service: TreeService = Depends(get_service),
):
    try:
        service.remove_node(node_id, cascade=cascade)
    except NodeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")


class MoveNodeRequest(BaseModel):
    new_parent_id: UUID


@router.post("/{node_id}/move", response_model=dict)
def move_node(
    node_id: UUID,
    body: MoveNodeRequest,
    service: TreeService = Depends(get_service),
):
    try:
        service.move_subtree(node_id, body.new_parent_id)
        return {"status": "moved"}
    except NodeNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidMoveError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except InvalidNodeTypeError as e:
        raise HTTPException(status_code=400, detail=str(e))


class ReorderNodeRequest(BaseModel):
    direction: str  # "left" or "right"


@router.post("/{node_id}/reorder", response_model=dict)
def reorder_node(
    node_id: UUID,
    body: ReorderNodeRequest,
    service: TreeService = Depends(get_service),
):
    try:
        service.reorder_sibling(node_id, body.direction)
        return {"status": "reordered"}
    except NodeNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{node_id}/subtree", response_model=list[Node])
def get_subtree(node_id: UUID, service: TreeService = Depends(get_service)):
    try:
        return service.get_subtree(node_id)
    except NodeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")


@router.get("/{node_id}/children", response_model=list[Node])
def get_children(node_id: UUID, service: TreeService = Depends(get_service)):
    return service.get_children(node_id)


@router.get("/{node_id}/ancestors", response_model=list[Node])
def get_ancestors(node_id: UUID, service: TreeService = Depends(get_service)):
    return service.get_ancestors(node_id)
