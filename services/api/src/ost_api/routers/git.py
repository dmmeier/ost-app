"""Git export API endpoints — commit tree JSONs to a remote git repo."""

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ost_api.deps import get_service
from ost_core.config import get_settings
from ost_core.exceptions import (
    GitNotConfiguredError,
    GitOperationError,
    GitPushConflictError,
    ProjectNotFoundError,
    TreeNotFoundError,
)
from ost_core.services.git_service import commit_tree_to_git
from ost_core.services.tree_service import TreeService

router = APIRouter()


# ── Request / Response models ───────────────────────────────


class GitCommitRequest(BaseModel):
    tree_id: str
    commit_message: str = ""


class GitCommitResponse(BaseModel):
    commit_sha: str
    file_path: str
    branch: str
    pushed: bool
    no_changes: bool = False


class GitStatusResponse(BaseModel):
    configured: bool
    remote_url: str  # masked
    branch: str
    user_name: str
    user_email: str


# ── Helpers ─────────────────────────────────────────────────


def _mask_url(url: str) -> str:
    """Mask credentials/tokens in a URL for display."""
    if not url:
        return ""
    if "@" in url and url.startswith("https://"):
        # https://token@github.com/... → https://***@github.com/...
        at_idx = url.index("@")
        return "https://***" + url[at_idx:]
    return url


# ── Endpoints ───────────────────────────────────────────────


@router.get("/status", response_model=GitStatusResponse)
def git_status():
    """Return the current git export configuration status."""
    settings = get_settings()
    return GitStatusResponse(
        configured=bool(settings.git_remote_url),
        remote_url=_mask_url(settings.git_remote_url),
        branch=settings.git_branch,
        user_name=settings.user_name,
        user_email=settings.user_email,
    )


@router.post("/commit", response_model=GitCommitResponse)
async def git_commit(
    body: GitCommitRequest,
    service: TreeService = Depends(get_service),
):
    """Export a tree as JSON and commit + push to the configured git remote."""
    settings = get_settings()

    # Fetch tree + project
    try:
        tree = service.get_tree(body.tree_id)
    except TreeNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    try:
        project = service.get_project(tree.project_id)
    except ProjectNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    full_tree = service.get_full_tree(body.tree_id)
    tree_json = full_tree.model_dump(mode="json")

    commit_msg = body.commit_message or f"Update {tree.name}"

    try:
        result = await asyncio.to_thread(
            commit_tree_to_git,
            tree_json=tree_json,
            project_name=project.name,
            tree_name=tree.name,
            commit_message=commit_msg,
            settings=settings,
        )
    except GitNotConfiguredError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except GitPushConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except GitOperationError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return GitCommitResponse(
        commit_sha=result.commit_sha,
        file_path=result.file_path,
        branch=result.branch,
        pushed=result.pushed,
        no_changes=result.no_changes,
    )
