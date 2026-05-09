"""Tag endpoints for managing project-level tags and node-tag assignments."""

from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ost_core.models import Tag, TagCreate, TagUpdate
from ost_core.models.user import User
from ost_core.services.tree_service import TreeService
from ost_api.deps import get_current_user_required, get_service

router = APIRouter()


class AddTagToNodeRequest(BaseModel):
    tag_name: str


@router.post("/project/{project_id}", response_model=Tag)
def create_tag(
    project_id: UUID,
    data: TagCreate,
    service: TreeService = Depends(get_service),
    _user: User | None = Depends(get_current_user_required),
):
    """Create a new tag for a project."""
    return service.create_tag(project_id, data)


@router.get("/project/{project_id}", response_model=list[Tag])
def list_tags(
    project_id: UUID,
    service: TreeService = Depends(get_service),
):
    """List all tags for a project."""
    return service.list_tags(project_id)


@router.delete("/{tag_id}")
def delete_tag(
    tag_id: UUID,
    service: TreeService = Depends(get_service),
    _user: User | None = Depends(get_current_user_required),
):
    """Delete a tag. Returns usage count before deletion."""
    usage_count = service.get_tag_usage_count(tag_id)
    service.delete_tag(tag_id)
    return {"status": "deleted", "tag_id": str(tag_id), "was_used_on": usage_count}


@router.patch("/{tag_id}", response_model=Tag)
def update_tag(
    tag_id: UUID,
    data: TagUpdate,
    service: TreeService = Depends(get_service),
    _user: User | None = Depends(get_current_user_required),
):
    """Update a tag's color and/or fill_style."""
    return service.update_tag(tag_id, data)


@router.post("/node/{node_id}", response_model=Tag)
def add_tag_to_node(
    node_id: UUID,
    data: AddTagToNodeRequest,
    project_id: UUID | None = None,
    service: TreeService = Depends(get_service),
    _user: User | None = Depends(get_current_user_required),
):
    """Add a tag to a node by name (creates tag if it doesn't exist).
    Requires project_id query param to know which project the tag belongs to."""
    if project_id is None:
        # Resolve project_id from node -> tree -> project
        node = service.get_node(node_id)
        tree = service.get_tree(node.tree_id)
        project_id = tree.project_id
    return service.add_tag_to_node_by_name(node_id, data.tag_name, project_id)


@router.delete("/node/{node_id}/{tag_id}")
def remove_tag_from_node(
    node_id: UUID,
    tag_id: UUID,
    service: TreeService = Depends(get_service),
    _user: User | None = Depends(get_current_user_required),
):
    """Remove a tag from a node."""
    service.remove_tag_from_node(node_id, tag_id)
    return {"status": "removed"}


@router.get("/filter/{tree_id}")
def get_tree_filtered_by_tag(
    tree_id: UUID,
    tag: str,
    service: TreeService = Depends(get_service),
):
    """Get a tree filtered to only show nodes with the specified tag and their ancestors."""
    return service.get_tree_filtered_by_tag(tree_id, tag)
