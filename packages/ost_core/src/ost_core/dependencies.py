"""Service factories and dependency injection helpers."""

from ost_core.config import get_settings
from ost_core.db.engine import get_engine, get_session_factory, init_db
from ost_core.db.repository import TreeRepository
from ost_core.services.tree_service import TreeService
from ost_core.validation.validator import TreeValidator

_tree_service: TreeService | None = None


def get_tree_service(db_url: str | None = None) -> TreeService:
    """Get or create a TreeService singleton."""
    global _tree_service
    if _tree_service is None:
        settings = get_settings()
        url = db_url or settings.database_url
        engine = get_engine(url)
        init_db(engine)
        session_factory = get_session_factory(engine)
        repo = TreeRepository(session_factory)
        _tree_service = TreeService(repo)
    return _tree_service


def get_tree_service_fresh(db_url: str | None = None) -> TreeService:
    """Create a fresh TreeService (non-singleton, useful for testing)."""
    settings = get_settings()
    url = db_url or settings.database_url
    engine = get_engine(url)
    init_db(engine)
    session_factory = get_session_factory(engine)
    repo = TreeRepository(session_factory)
    return TreeService(repo)


def get_validator(db_url: str | None = None) -> TreeValidator:
    """Create a TreeValidator."""
    settings = get_settings()
    url = db_url or settings.database_url
    engine = get_engine(url)
    init_db(engine)
    session_factory = get_session_factory(engine)
    repo = TreeRepository(session_factory)
    return TreeValidator(repo)


def reset_singleton() -> None:
    """Reset the singleton (useful for testing)."""
    global _tree_service
    _tree_service = None
