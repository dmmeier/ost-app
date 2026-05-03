"""Service factories and dependency injection helpers."""

import os

from ost_core.config import get_settings
from ost_core.db.engine import get_engine, get_session_factory, init_db
from ost_core.db.repository import TreeRepository
from ost_core.services.tree_service import TreeService
from ost_core.validation.validator import TreeValidator

_tree_service: TreeService | None = None


def _resolve_db_url(db_url: str | None = None) -> str:
    """Resolve database URL from explicit arg, env var, or settings.

    Priority: explicit arg > DATABASE_URL env var > OST_DATABASE_URL > default.
    """
    if db_url:
        return db_url
    env_url = os.environ.get("DATABASE_URL")
    if env_url:
        return env_url
    return get_settings().database_url


def get_tree_service(db_url: str | None = None) -> TreeService:
    """Get or create a TreeService singleton."""
    global _tree_service
    if _tree_service is None:
        url = _resolve_db_url(db_url)
        engine = get_engine(url)
        init_db(engine)
        session_factory = get_session_factory(engine)
        repo = TreeRepository(session_factory)
        _tree_service = TreeService(repo)
    return _tree_service


def get_tree_service_fresh(db_url: str | None = None) -> TreeService:
    """Create a fresh TreeService (non-singleton, useful for testing)."""
    url = _resolve_db_url(db_url)
    engine = get_engine(url)
    init_db(engine)
    session_factory = get_session_factory(engine)
    repo = TreeRepository(session_factory)
    return TreeService(repo)


def get_validator(db_url: str | None = None) -> TreeValidator:
    """Create a TreeValidator."""
    url = _resolve_db_url(db_url)
    engine = get_engine(url)
    init_db(engine)
    session_factory = get_session_factory(engine)
    repo = TreeRepository(session_factory)
    return TreeValidator(repo)


def reset_singleton() -> None:
    """Reset the singleton (useful for testing)."""
    global _tree_service
    _tree_service = None
