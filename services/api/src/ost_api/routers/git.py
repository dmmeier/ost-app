"""Git export API endpoints — commit tree JSONs to a remote git repo.

Now supports per-project git configuration, author tracking, and commit history.
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from ost_core.config import get_settings
from ost_core.exceptions import (
    GitAuthenticationError,
    GitNotConfiguredError,
    GitOperationError,
    GitPushConflictError,
    PermissionDeniedError,
    ProjectNotFoundError,
    TreeNotFoundError,
)
from ost_core.models.user import User
from ost_core.services.git_service import commit_tree_to_git
from ost_core.services.tree_service import TreeService
from pydantic import BaseModel

from ost_api.deps import get_current_user_required, get_service

router = APIRouter()


# ── Request / Response models ───────────────────────────────


class GitCommitRequest(BaseModel):
    tree_id: str
    commit_message: str = ""
    author_name: str = ""
    author_email: str = ""


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
    token_configured: bool


class GitConfigUpdateRequest(BaseModel):
    remote_url: str | None = None
    branch: str | None = None


class GitAuthorResponse(BaseModel):
    name: str
    email: str


class GitCommitLogResponse(BaseModel):
    id: str
    project_id: str
    tree_id: str | None
    commit_sha: str
    author_name: str
    author_email: str
    commit_message: str
    file_path: str
    branch: str
    remote_url: str
    created_at: str


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


@router.get("/status/{project_id}", response_model=GitStatusResponse)
def git_status(
    project_id: str,
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    """Return git configuration for a project, with env fallback."""
    try:
        service.check_project_permission(str(user.id) if user else None, project_id, "viewer")
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))

    settings = get_settings()

    try:
        project = service.get_project(project_id)
    except ProjectNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Project-level config takes priority, fall back to env
    remote_url = project.git_remote_url or settings.git_remote_url or ""
    branch = project.git_branch or settings.git_branch or "main"

    return GitStatusResponse(
        configured=bool(remote_url),
        remote_url=_mask_url(remote_url),
        branch=branch,
        token_configured=bool(settings.resolved_git_token),
    )


@router.patch("/config/{project_id}", response_model=GitStatusResponse)
def git_config_update(
    project_id: str,
    body: GitConfigUpdateRequest,
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    """Save git remote URL and branch to the project."""
    from ost_core.models import ProjectUpdate

    try:
        service.check_project_permission(str(user.id) if user else None, project_id, "owner")
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))

    try:
        service.get_project(project_id)
    except ProjectNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    update_data = ProjectUpdate()
    if body.remote_url is not None:
        update_data.git_remote_url = body.remote_url
    if body.branch is not None:
        update_data.git_branch = body.branch

    service.update_project(project_id, update_data)

    # Return updated status
    settings = get_settings()
    project = service.get_project(project_id)
    remote_url = project.git_remote_url or settings.git_remote_url or ""
    branch = project.git_branch or settings.git_branch or "main"

    return GitStatusResponse(
        configured=bool(remote_url),
        remote_url=_mask_url(remote_url),
        branch=branch,
        token_configured=bool(settings.resolved_git_token),
    )


@router.post("/commit", response_model=GitCommitResponse)
async def git_commit(
    body: GitCommitRequest,
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    """Export a tree as JSON and commit + push to the configured git remote."""
    settings = get_settings()

    # Fetch tree + project
    try:
        tree = service.get_tree(body.tree_id)
    except TreeNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    try:
        service.check_project_permission(str(user.id) if user else None, str(tree.project_id), "editor")
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))

    try:
        project = service.get_project(tree.project_id)
    except ProjectNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    tree_json = service.export_tree(body.tree_id)

    commit_msg = body.commit_message or f"Update {tree.name}"

    # Resolve config: project-level > env-level
    remote_url = project.git_remote_url or settings.git_remote_url or ""
    branch = project.git_branch or settings.git_branch or "main"
    token = settings.resolved_git_token
    author_name = body.author_name or settings.user_name or ""
    author_email = body.author_email or settings.user_email or ""

    try:
        result = await asyncio.to_thread(
            commit_tree_to_git,
            tree_json=tree_json,
            project_name=project.name,
            tree_name=tree.name,
            commit_message=commit_msg,
            remote_url=remote_url,
            branch=branch,
            token=token,
            author_name=author_name,
            author_email=author_email,
        )
    except GitNotConfiguredError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except GitAuthenticationError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except GitPushConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except GitOperationError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Log the commit to DB
    if not result.no_changes and author_name and author_email:
        try:
            service.create_git_commit_log(
                project_id=tree.project_id,
                tree_id=tree.id,
                commit_sha=result.commit_sha,
                author_name=author_name,
                author_email=author_email,
                commit_message=commit_msg,
                file_path=result.file_path,
                branch=result.branch,
                remote_url=remote_url,
            )
        except Exception:
            pass  # Don't fail the commit response if logging fails

    return GitCommitResponse(
        commit_sha=result.commit_sha,
        file_path=result.file_path,
        branch=result.branch,
        pushed=result.pushed,
        no_changes=result.no_changes,
    )


@router.get("/authors/{project_id}", response_model=list[GitAuthorResponse])
def git_authors(
    project_id: str,
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    """Get distinct authors from commit history for a project."""
    try:
        service.check_project_permission(str(user.id) if user else None, project_id, "viewer")
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))

    try:
        service.get_project(project_id)
    except ProjectNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    authors = service.get_git_authors(project_id)
    return [GitAuthorResponse(name=a.name, email=a.email) for a in authors]


@router.get("/history/{project_id}", response_model=list[GitCommitLogResponse])
def git_history(
    project_id: str,
    limit: int = 50,
    service: TreeService = Depends(get_service),
    user: User | None = Depends(get_current_user_required),
):
    """Get commit history for a project (newest first)."""
    try:
        service.check_project_permission(str(user.id) if user else None, project_id, "viewer")
    except PermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))

    try:
        service.get_project(project_id)
    except ProjectNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    logs = service.list_git_commit_logs(project_id, limit=limit)
    return [
        GitCommitLogResponse(
            id=str(log.id),
            project_id=str(log.project_id),
            tree_id=str(log.tree_id) if log.tree_id else None,
            commit_sha=log.commit_sha,
            author_name=log.author_name,
            author_email=log.author_email,
            commit_message=log.commit_message,
            file_path=log.file_path,
            branch=log.branch,
            remote_url=_mask_url(log.remote_url),
            created_at=log.created_at.isoformat(),
        )
        for log in logs
    ]
