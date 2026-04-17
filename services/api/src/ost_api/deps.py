"""FastAPI dependency injection."""

from functools import lru_cache

from ost_core.db.repository import TreeRepository
from ost_core.dependencies import get_tree_service_fresh, get_validator
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
