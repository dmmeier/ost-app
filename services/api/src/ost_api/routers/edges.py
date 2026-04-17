"""Edge hypothesis endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ost_core.exceptions import EdgeNotFoundError, NodeNotFoundError
from ost_core.models import EdgeHypothesis, EdgeHypothesisCreate, EdgeHypothesisUpdate
from ost_core.services.tree_service import TreeService
from ost_api.deps import get_service

router = APIRouter()


@router.post("/", response_model=EdgeHypothesis, status_code=201)
def set_edge_hypothesis(
    data: EdgeHypothesisCreate, service: TreeService = Depends(get_service)
):
    try:
        return service.set_edge_hypothesis(data)
    except NodeNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{edge_id}", status_code=204)
def delete_edge(edge_id: UUID, service: TreeService = Depends(get_service)):
    try:
        service.delete_edge(edge_id)
    except EdgeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Edge {edge_id} not found")


@router.get("/{parent_id}/{child_id}", response_model=EdgeHypothesis | None)
def get_edge_hypothesis(
    parent_id: UUID,
    child_id: UUID,
    service: TreeService = Depends(get_service),
):
    return service.get_edge_hypothesis(parent_id, child_id)


@router.get("/by-id/{edge_id}", response_model=EdgeHypothesis)
def get_edge_by_id(edge_id: UUID, service: TreeService = Depends(get_service)):
    try:
        return service.get_edge_by_id(edge_id)
    except EdgeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Edge {edge_id} not found")


@router.patch("/{edge_id}", response_model=EdgeHypothesis)
def update_edge(
    edge_id: UUID,
    data: EdgeHypothesisUpdate,
    service: TreeService = Depends(get_service),
):
    try:
        return service.update_edge(edge_id, data)
    except EdgeNotFoundError:
        raise HTTPException(status_code=404, detail=f"Edge {edge_id} not found")


