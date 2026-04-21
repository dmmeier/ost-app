"""Database engine and session management."""

import os
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from ost_core.db.schema import Base


@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable foreign keys for SQLite connections."""
    import sqlite3

    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def get_engine(db_url: str | None = None) -> Engine:
    """Create database engine.

    Supports SQLite (default) and PostgreSQL via DATABASE_URL env var.

    Examples:
        SQLite:     sqlite:///ost.db
        PostgreSQL: postgresql://user:pass@host:5432/dbname
    """
    if db_url is None:
        db_url = os.getenv("DATABASE_URL", "sqlite:///ost.db")

    return create_engine(db_url, echo=False)


def get_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine)


def _migrate_add_columns(engine: Engine) -> None:
    """Add new columns to existing tables if they're missing."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "trees" in inspector.get_table_names():
        columns = [c["name"] for c in inspector.get_columns("trees")]
        with engine.begin() as conn:
            if "agent_knowledge" not in columns:
                conn.execute(text("ALTER TABLE trees ADD COLUMN agent_knowledge TEXT DEFAULT ''"))

    if "projects" in inspector.get_table_names():
        project_columns = [c["name"] for c in inspector.get_columns("projects")]
        with engine.begin() as conn:
            if "bubble_defaults" not in project_columns:
                conn.execute(text("ALTER TABLE projects ADD COLUMN bubble_defaults TEXT"))
            if "git_remote_url" not in project_columns:
                conn.execute(text("ALTER TABLE projects ADD COLUMN git_remote_url TEXT"))
            if "git_branch" not in project_columns:
                conn.execute(text("ALTER TABLE projects ADD COLUMN git_branch VARCHAR(100) DEFAULT 'main'"))

    if "edge_hypotheses" in inspector.get_table_names():
        edge_columns = [c["name"] for c in inspector.get_columns("edge_hypotheses")]
        with engine.begin() as conn:
            if "evidence" not in edge_columns:
                conn.execute(text("ALTER TABLE edge_hypotheses ADD COLUMN evidence TEXT DEFAULT ''"))

    if "project_tags" in inspector.get_table_names():
        tag_columns = [c["name"] for c in inspector.get_columns("project_tags")]
        with engine.begin() as conn:
            if "fill_style" not in tag_columns:
                conn.execute(text("ALTER TABLE project_tags ADD COLUMN fill_style VARCHAR(20)"))
            if "font_light" not in tag_columns:
                conn.execute(text("ALTER TABLE project_tags ADD COLUMN font_light BOOLEAN DEFAULT 0"))

    if "nodes" in inspector.get_table_names():
        node_columns = [c["name"] for c in inspector.get_columns("nodes")]
        with engine.begin() as conn:
            if "override_border_color" not in node_columns:
                conn.execute(text("ALTER TABLE nodes ADD COLUMN override_border_color VARCHAR(20)"))
            if "override_border_width" not in node_columns:
                conn.execute(text("ALTER TABLE nodes ADD COLUMN override_border_width FLOAT"))
            if "override_fill_color" not in node_columns:
                conn.execute(text("ALTER TABLE nodes ADD COLUMN override_fill_color VARCHAR(20)"))
            if "override_fill_style" not in node_columns:
                conn.execute(text("ALTER TABLE nodes ADD COLUMN override_fill_style VARCHAR(20)"))
            if "sort_order" not in node_columns:
                conn.execute(text("ALTER TABLE nodes ADD COLUMN sort_order INTEGER DEFAULT 0"))
            if "edge_thickness" not in node_columns:
                conn.execute(text("ALTER TABLE nodes ADD COLUMN edge_thickness INTEGER"))
            if "assumption" not in node_columns:
                conn.execute(text("ALTER TABLE nodes ADD COLUMN assumption TEXT DEFAULT ''"))
            if "evidence" not in node_columns:
                conn.execute(text("ALTER TABLE nodes ADD COLUMN evidence TEXT DEFAULT ''"))
            if "override_font_light" not in node_columns:
                conn.execute(text("ALTER TABLE nodes ADD COLUMN override_font_light BOOLEAN"))

    if "edge_hypotheses" in inspector.get_table_names():
        edge_columns = [c["name"] for c in inspector.get_columns("edge_hypotheses")]
        with engine.begin() as conn:
            if "thickness" not in edge_columns:
                conn.execute(text("ALTER TABLE edge_hypotheses ADD COLUMN thickness INTEGER"))


def _migrate_projects(engine: Engine) -> None:
    """Migrate existing trees into the projects structure."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    if "trees" not in table_names:
        return  # Fresh DB, nothing to migrate

    columns = [c["name"] for c in inspector.get_columns("trees")]

    # Step 1: If trees lacks project_id, create a default project and assign all trees
    if "project_id" not in columns:
        default_project_id = str(uuid4())
        now = datetime.now(UTC).isoformat()
        with engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO projects (id, name, description, project_context, created_at, updated_at) "
                "VALUES (:id, :name, '', '', :now, :now)"
            ), {"id": default_project_id, "name": "Default Project", "now": now})
            conn.execute(text("ALTER TABLE trees ADD COLUMN project_id TEXT"))
            conn.execute(text(
                "UPDATE trees SET project_id = :pid"
            ), {"pid": default_project_id})

    # Step 2: Rename project_context → tree_context
    # Re-read columns in case we just added project_id
    columns = [c["name"] for c in inspector.get_columns("trees")]
    if "project_context" in columns and "tree_context" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE trees ADD COLUMN tree_context TEXT DEFAULT ''"))
            conn.execute(text("UPDATE trees SET tree_context = project_context"))


def _migrate_drop_edge_unique(engine: Engine) -> None:
    """Drop the legacy UNIQUE constraint on (parent_node_id, child_node_id)
    in edge_hypotheses so multiple assumptions per edge are allowed."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "edge_hypotheses" not in inspector.get_table_names():
        return

    unique_constraints = inspector.get_unique_constraints("edge_hypotheses")
    has_unique = any(
        set(uc["column_names"]) == {"parent_node_id", "child_node_id"}
        for uc in unique_constraints
    )
    if not has_unique:
        return

    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE edge_hypotheses_new ("
            "  id VARCHAR(36) PRIMARY KEY,"
            "  parent_node_id VARCHAR(36) NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,"
            "  child_node_id VARCHAR(36) NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,"
            "  hypothesis TEXT NOT NULL,"
            "  hypothesis_type VARCHAR(50) NOT NULL,"
            "  is_risky BOOLEAN DEFAULT 0,"
            "  status VARCHAR(20) DEFAULT 'untested',"
            "  evidence TEXT DEFAULT '',"
            "  created_at DATETIME,"
            "  updated_at DATETIME"
            ")"
        ))
        conn.execute(text(
            "INSERT INTO edge_hypotheses_new "
            "SELECT id, parent_node_id, child_node_id, hypothesis, hypothesis_type, "
            "is_risky, status, evidence, created_at, updated_at "
            "FROM edge_hypotheses"
        ))
        conn.execute(text("DROP TABLE edge_hypotheses"))
        conn.execute(text("ALTER TABLE edge_hypotheses_new RENAME TO edge_hypotheses"))
        conn.execute(text(
            "CREATE INDEX ix_edge_parent_child ON edge_hypotheses(parent_node_id, child_node_id)"
        ))


def init_db(engine: Engine) -> None:
    """Create all tables if they don't exist."""
    Base.metadata.create_all(engine)
    _migrate_add_columns(engine)
    _migrate_projects(engine)
    _migrate_drop_edge_unique(engine)
