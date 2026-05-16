"""FastAPI dependency injection."""

from functools import lru_cache
from typing import Optional

from fastapi import Depends, Header, HTTPException

from ost_core.auth import decode_token
from ost_core.db.repository import TreeRepository
from ost_core.dependencies import get_tree_service_fresh, get_validator
from ost_core.models import User
from ost_core.services.tree_service import TreeService
from ost_core.validation.validator import TreeValidator


@lru_cache
def get_service() -> TreeService:
    return get_tree_service_fresh()


@lru_cache
def get_tree_validator() -> TreeValidator:
    return get_validator()


@lru_cache
def get_repo() -> TreeRepository:
    """Get the repository for direct data access (chat, snapshots)."""
    return get_service().repo


def get_current_user(
    authorization: Optional[str] = Header(None),
    service: TreeService = Depends(get_service),
) -> User | None:
    """Extract and validate Bearer token. Returns User or None."""
    if not authorization:
        return None
    if not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return None
        return service.get_user(user_id)
    except Exception:
        return None


def get_current_user_required(
    authorization: Optional[str] = Header(None),
    service: TreeService = Depends(get_service),
) -> User:
    """Always require a valid Bearer token. Raises 401 otherwise."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    token = authorization[7:]
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = service.get_user(user_id)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
