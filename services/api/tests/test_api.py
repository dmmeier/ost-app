"""Tests for the FastAPI REST API."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from ost_api.main import app
from ost_api.deps import get_repo, get_service, get_tree_validator
from ost_core.config import Settings
from ost_core.db.repository import TreeRepository
from ost_core.db.schema import Base
from ost_core.exceptions import GitNotConfiguredError, GitPushConflictError
from ost_core.llm.base import LLMResponse, ToolCall
from ost_core.services.tree_service import TreeService
from ost_core.validation.validator import TreeValidator
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture
def test_service():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    sf = sessionmaker(bind=engine)
    repo = TreeRepository(sf)
    return TreeService(repo), TreeValidator(repo)


@pytest.fixture
def client(test_service):
    service, validator = test_service

    def _override_service():
        return service

    def _override_validator():
        return validator

    def _override_repo():
        return service.repo

    app.dependency_overrides[get_service] = _override_service
    app.dependency_overrides[get_tree_validator] = _override_validator
    app.dependency_overrides[get_repo] = _override_repo

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


def _create_project(client, name="Test Project"):
    """Helper to create a project and return its data."""
    r = client.post("/api/v1/projects/", json={"name": name})
    assert r.status_code == 201
    return r.json()


def _create_tree(client, project_id, name="Test"):
    """Helper to create a tree within a project."""
    r = client.post("/api/v1/trees/", json={"name": name, "project_id": project_id})
    assert r.status_code == 201
    return r.json()


class TestProjectEndpoints:
    def test_create_project(self, client):
        r = client.post("/api/v1/projects/", json={"name": "My Project", "description": "Desc"})
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "My Project"
        assert "id" in data

    def test_list_projects(self, client):
        _create_project(client, "P1")
        _create_project(client, "P2")
        r = client.get("/api/v1/projects/")
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_get_project_with_trees(self, client):
        project = _create_project(client)
        _create_tree(client, project["id"], "Tree 1")
        _create_tree(client, project["id"], "Tree 2")
        r = client.get(f"/api/v1/projects/{project['id']}")
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Test Project"
        assert len(data["trees"]) == 2

    def test_update_project(self, client):
        project = _create_project(client)
        r = client.patch(
            f"/api/v1/projects/{project['id']}",
            json={"name": "Updated", "project_context": "Some context"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Updated"
        assert data["project_context"] == "Some context"

    def test_delete_project(self, client):
        project = _create_project(client)
        r = client.delete(f"/api/v1/projects/{project['id']}")
        assert r.status_code == 204

    def test_delete_project_cascades_trees(self, client):
        project = _create_project(client)
        _create_tree(client, project["id"])
        client.delete(f"/api/v1/projects/{project['id']}")
        r = client.get("/api/v1/trees/")
        assert len(r.json()) == 0

    def test_get_project_not_found(self, client):
        r = client.get("/api/v1/projects/00000000-0000-0000-0000-000000000000")
        assert r.status_code == 404

    def test_update_project_bubble_defaults_via_patch(self, client):
        project = _create_project(client)
        r = client.patch(
            f"/api/v1/projects/{project['id']}",
            json={
                "bubble_defaults": {
                    "outcome": {"border_color": "#ff0000", "border_width": 3.0},
                    "opportunity": {"border_color": "#00ff00", "border_width": 1.5},
                }
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["bubble_defaults"]["outcome"]["border_color"] == "#ff0000"
        assert data["bubble_defaults"]["opportunity"]["border_width"] == 1.5

    def test_get_bubble_defaults_returns_system_defaults_when_unset(self, client):
        project = _create_project(client)
        r = client.get(f"/api/v1/projects/{project['id']}/bubble-defaults")
        assert r.status_code == 200
        data = r.json()
        # Should return system defaults for all 5 node types
        assert "outcome" in data
        assert "opportunity" in data
        assert "child_opportunity" in data
        assert "solution" in data
        assert "experiment" in data
        assert data["outcome"]["border_color"] == "#93c5fd"

    def test_get_bubble_defaults_returns_custom_values(self, client):
        project = _create_project(client)
        client.patch(
            f"/api/v1/projects/{project['id']}",
            json={
                "bubble_defaults": {
                    "outcome": {"border_color": "#ff0000", "border_width": 4.0},
                }
            },
        )
        r = client.get(f"/api/v1/projects/{project['id']}/bubble-defaults")
        assert r.status_code == 200
        data = r.json()
        assert data["outcome"]["border_color"] == "#ff0000"
        assert data["outcome"]["border_width"] == 4.0

    def test_put_bubble_defaults(self, client):
        project = _create_project(client)
        r = client.put(
            f"/api/v1/projects/{project['id']}/bubble-defaults",
            json={
                "outcome": {"border_color": "#aabbcc", "border_width": 2.5},
                "solution": {"border_color": "#ddeeff", "border_width": 3.0},
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["bubble_defaults"]["outcome"]["border_color"] == "#aabbcc"
        assert data["bubble_defaults"]["solution"]["border_width"] == 3.0

    def test_bubble_defaults_not_found_project(self, client):
        r = client.get("/api/v1/projects/00000000-0000-0000-0000-000000000000/bubble-defaults")
        assert r.status_code == 404


class TestTreeEndpoints:
    def test_health(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}

    def test_create_tree(self, client):
        project = _create_project(client)
        r = client.post(
            "/api/v1/trees/",
            json={"name": "Test", "description": "A test", "project_id": project["id"]},
        )
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "Test"
        assert data["project_id"] == project["id"]
        assert "id" in data

    def test_list_trees(self, client):
        project = _create_project(client)
        _create_tree(client, project["id"], "Tree 1")
        _create_tree(client, project["id"], "Tree 2")
        r = client.get("/api/v1/trees/")
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_list_trees_by_project(self, client):
        p1 = _create_project(client, "P1")
        p2 = _create_project(client, "P2")
        _create_tree(client, p1["id"], "T1")
        _create_tree(client, p1["id"], "T2")
        _create_tree(client, p2["id"], "T3")
        r = client.get(f"/api/v1/trees/?project_id={p1['id']}")
        assert len(r.json()) == 2
        r = client.get(f"/api/v1/trees/?project_id={p2['id']}")
        assert len(r.json()) == 1

    def test_get_tree(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        r = client.get(f"/api/v1/trees/{tree['id']}")
        assert r.status_code == 200
        assert r.json()["name"] == "Test"

    def test_get_tree_not_found(self, client):
        r = client.get("/api/v1/trees/00000000-0000-0000-0000-000000000000")
        assert r.status_code == 404

    def test_delete_tree(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"], "To delete")
        r = client.delete(f"/api/v1/trees/{tree['id']}")
        assert r.status_code == 204


class TestNodeEndpoints:
    def test_add_root_node(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        r = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome"},
        )
        assert r.status_code == 201
        assert r.json()["title"] == "Root"

    def test_add_child_node(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome"},
        ).json()
        r = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={
                "title": "Opp",
                "node_type": "opportunity",
                "parent_id": root["id"],
            },
        )
        assert r.status_code == 201
        assert r.json()["parent_id"] == root["id"]

    def test_any_type_under_any_parent(self, client):
        """Type constraints removed — any type can be added under any parent."""
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome"},
        ).json()
        r = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={
                "title": "Sol",
                "node_type": "solution",
                "parent_id": root["id"],
            },
        )
        assert r.status_code == 201
        assert r.json()["node_type"] == "solution"

    def test_get_node(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        node = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome"},
        ).json()
        r = client.get(f"/api/v1/nodes/{node['id']}")
        assert r.status_code == 200
        assert r.json()["title"] == "Root"

    def test_delete_node(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        node = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome"},
        ).json()
        r = client.delete(f"/api/v1/nodes/{node['id']}")
        assert r.status_code == 204

    def test_move_root_to_descendant_returns_400(self, client):
        """Moving a root to its own descendant should return 400 (cycle detection)."""
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome"},
        ).json()
        opp = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Opp", "node_type": "opportunity", "parent_id": root["id"]},
        ).json()
        r = client.post(
            f"/api/v1/nodes/{root['id']}/move",
            json={"new_parent_id": opp["id"]},
        )
        assert r.status_code == 400
        assert "descendants" in r.json()["detail"]

    def test_move_cross_tree_returns_400(self, client):
        """Moving a node to a different tree should return 400 with cross-tree error."""
        project = _create_project(client)
        tree1 = _create_tree(client, project["id"], "Tree 1")
        tree2 = _create_tree(client, project["id"], "Tree 2")
        root1 = client.post(
            f"/api/v1/nodes?tree_id={tree1['id']}",
            json={"title": "Root1", "node_type": "outcome"},
        ).json()
        opp1 = client.post(
            f"/api/v1/nodes?tree_id={tree1['id']}",
            json={"title": "Opp1", "node_type": "opportunity", "parent_id": root1["id"]},
        ).json()
        root2 = client.post(
            f"/api/v1/nodes?tree_id={tree2['id']}",
            json={"title": "Root2", "node_type": "outcome"},
        ).json()
        opp2 = client.post(
            f"/api/v1/nodes?tree_id={tree2['id']}",
            json={"title": "Opp2", "node_type": "opportunity", "parent_id": root2["id"]},
        ).json()
        r = client.post(
            f"/api/v1/nodes/{opp1['id']}/move",
            json={"new_parent_id": opp2["id"]},
        )
        assert r.status_code == 400
        assert "Cannot move a node to a different tree" in r.json()["detail"]


class TestEdgeDeleteAndMultiple:
    """Test edge deletion and multiple assumptions per parent-child pair."""

    def test_delete_edge(self, client):
        """DELETE /edges/{edge_id} removes the assumption."""
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome"},
        ).json()
        opp = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Opp", "node_type": "opportunity", "parent_id": root["id"]},
        ).json()
        edge = client.post(
            "/api/v1/edges/",
            json={
                "parent_node_id": root["id"],
                "child_node_id": opp["id"],
                "hypothesis": "Test hypothesis",
                "hypothesis_type": "problem",
            },
        ).json()
        r = client.delete(f"/api/v1/edges/{edge['id']}")
        assert r.status_code == 204
        # Verify it's gone
        r2 = client.get(f"/api/v1/edges/{root['id']}/{opp['id']}")
        assert r2.json() is None

    def test_delete_edge_not_found(self, client):
        """DELETE /edges/{edge_id} returns 404 for unknown edge."""
        import uuid
        r = client.delete(f"/api/v1/edges/{uuid.uuid4()}")
        assert r.status_code == 404

    def test_multiple_assumptions_per_edge(self, client):
        """POST /edges/ allows multiple assumptions for the same parent-child pair."""
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome"},
        ).json()
        opp = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Opp", "node_type": "opportunity", "parent_id": root["id"]},
        ).json()
        e1 = client.post(
            "/api/v1/edges/",
            json={
                "parent_node_id": root["id"],
                "child_node_id": opp["id"],
                "hypothesis": "First assumption",
                "hypothesis_type": "problem",
            },
        )
        assert e1.status_code == 201
        e2 = client.post(
            "/api/v1/edges/",
            json={
                "parent_node_id": root["id"],
                "child_node_id": opp["id"],
                "hypothesis": "Second assumption",
                "hypothesis_type": "solution",
            },
        )
        assert e2.status_code == 201
        assert e1.json()["id"] != e2.json()["id"]


class TestValidationEndpoints:
    def test_validate_tree(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome"},
        ).json()
        client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Opp 1", "node_type": "opportunity", "parent_id": root["id"]},
        )
        client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Opp 2", "node_type": "opportunity", "parent_id": root["id"]},
        )

        r = client.post(f"/api/v1/validation/{tree['id']}/validate")
        assert r.status_code == 200
        data = r.json()
        assert "is_valid" in data
        assert "issues" in data


def _add_root_and_opp(client, tree_id):
    """Helper to add a root outcome + opportunity and return both."""
    root = client.post(
        f"/api/v1/nodes?tree_id={tree_id}",
        json={"title": "Root", "node_type": "outcome"},
    ).json()
    opp = client.post(
        f"/api/v1/nodes?tree_id={tree_id}",
        json={"title": "Opp", "node_type": "opportunity", "parent_id": root["id"]},
    ).json()
    return root, opp


class TestTagEndpoints:
    """Tests for tag CRUD API endpoints."""

    def test_create_tag(self, client):
        project = _create_project(client)
        r = client.post(
            f"/api/v1/tags/project/{project['id']}",
            json={"name": "UX"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "UX"
        assert data["project_id"] == project["id"]

    def test_create_tag_with_color(self, client):
        project = _create_project(client)
        r = client.post(
            f"/api/v1/tags/project/{project['id']}",
            json={"name": "P0", "color": "#ef4444"},
        )
        assert r.status_code == 200
        assert r.json()["color"] == "#ef4444"

    def test_list_tags(self, client):
        project = _create_project(client)
        client.post(
            f"/api/v1/tags/project/{project['id']}", json={"name": "Alpha"}
        )
        client.post(
            f"/api/v1/tags/project/{project['id']}", json={"name": "Beta"}
        )
        r = client.get(f"/api/v1/tags/project/{project['id']}")
        assert r.status_code == 200
        tags = r.json()
        assert len(tags) == 2
        assert tags[0]["name"] == "Alpha"

    def test_list_tags_empty(self, client):
        project = _create_project(client)
        r = client.get(f"/api/v1/tags/project/{project['id']}")
        assert r.status_code == 200
        assert r.json() == []

    def test_delete_tag(self, client):
        project = _create_project(client)
        tag = client.post(
            f"/api/v1/tags/project/{project['id']}", json={"name": "Del"}
        ).json()
        r = client.delete(f"/api/v1/tags/{tag['id']}")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "deleted"
        # Should be gone
        tags = client.get(f"/api/v1/tags/project/{project['id']}").json()
        assert len(tags) == 0

    def test_delete_tag_returns_usage_count(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root, opp = _add_root_and_opp(client, tree["id"])
        tag = client.post(
            f"/api/v1/tags/project/{project['id']}", json={"name": "Used"}
        ).json()
        # Assign tag to a node
        client.post(
            f"/api/v1/tags/node/{opp['id']}?project_id={project['id']}",
            json={"tag_name": "Used"},
        )
        r = client.delete(f"/api/v1/tags/{tag['id']}")
        assert r.json()["was_used_on"] == 1

    def test_add_tag_to_node(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root, opp = _add_root_and_opp(client, tree["id"])
        r = client.post(
            f"/api/v1/tags/node/{opp['id']}?project_id={project['id']}",
            json={"tag_name": "Critical"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Critical"

    def test_add_tag_to_node_creates_tag_if_missing(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root, opp = _add_root_and_opp(client, tree["id"])
        # No tags exist yet
        r = client.post(
            f"/api/v1/tags/node/{opp['id']}?project_id={project['id']}",
            json={"tag_name": "AutoCreated"},
        )
        assert r.status_code == 200
        # Tag should now exist
        tags = client.get(f"/api/v1/tags/project/{project['id']}").json()
        assert any(t["name"] == "AutoCreated" for t in tags)

    def test_add_tag_to_node_resolves_project_id(self, client):
        """When project_id is omitted, it resolves from node->tree->project."""
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root, opp = _add_root_and_opp(client, tree["id"])
        r = client.post(
            f"/api/v1/tags/node/{opp['id']}",
            json={"tag_name": "Resolved"},
        )
        assert r.status_code == 200
        assert r.json()["name"] == "Resolved"

    def test_remove_tag_from_node(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root, opp = _add_root_and_opp(client, tree["id"])
        tag = client.post(
            f"/api/v1/tags/node/{opp['id']}?project_id={project['id']}",
            json={"tag_name": "Temp"},
        ).json()
        r = client.delete(f"/api/v1/tags/node/{opp['id']}/{tag['id']}")
        assert r.status_code == 200
        assert r.json()["status"] == "removed"

    def test_filter_tree_by_tag(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root, opp = _add_root_and_opp(client, tree["id"])
        # Add a second unrelated opp
        opp2 = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Opp2", "node_type": "opportunity", "parent_id": root["id"]},
        ).json()
        # Tag only opp (not opp2)
        client.post(
            f"/api/v1/tags/node/{opp['id']}?project_id={project['id']}",
            json={"tag_name": "Filter"},
        )
        r = client.get(f"/api/v1/tags/filter/{tree['id']}?tag=Filter")
        assert r.status_code == 200
        data = r.json()
        node_ids = {n["id"] for n in data["nodes"]}
        # opp and root should be present (tagged + ancestor)
        assert opp["id"] in node_ids
        assert root["id"] in node_ids
        # opp2 should NOT be present
        assert opp2["id"] not in node_ids

    def test_filter_tree_by_tag_no_matches(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        r = client.get(f"/api/v1/tags/filter/{tree['id']}?tag=NoMatch")
        assert r.status_code == 200
        assert r.json()["nodes"] == []

    def test_update_tag_color(self, client):
        project = _create_project(client)
        tag = client.post(
            f"/api/v1/tags/project/{project['id']}", json={"name": "PatchMe"}
        ).json()
        r = client.patch(f"/api/v1/tags/{tag['id']}", json={"color": "#ef4444"})
        assert r.status_code == 200
        data = r.json()
        assert data["color"] == "#ef4444"
        assert data["name"] == "PatchMe"

    def test_update_tag_fill_style(self, client):
        project = _create_project(client)
        tag = client.post(
            f"/api/v1/tags/project/{project['id']}", json={"name": "FillTag"}
        ).json()
        r = client.patch(f"/api/v1/tags/{tag['id']}", json={"fill_style": "solid"})
        assert r.status_code == 200
        assert r.json()["fill_style"] == "solid"

    def test_update_tag_clear_fill_style(self, client):
        project = _create_project(client)
        tag = client.post(
            f"/api/v1/tags/project/{project['id']}",
            json={"name": "ClearFill", "fill_style": "solid"},
        ).json()
        assert tag["fill_style"] == "solid"
        r = client.patch(f"/api/v1/tags/{tag['id']}", json={"fill_style": "none"})
        assert r.status_code == 200
        assert r.json()["fill_style"] is None

    def test_create_tag_with_fill_style(self, client):
        project = _create_project(client)
        r = client.post(
            f"/api/v1/tags/project/{project['id']}",
            json={"name": "FillCreate", "fill_style": "solid"},
        )
        assert r.status_code == 200
        assert r.json()["fill_style"] == "solid"


class TestEdgeEvidenceEndpoints:
    """Tests for evidence field on edges via the API."""

    def test_create_edge_with_evidence(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root, opp = _add_root_and_opp(client, tree["id"])
        r = client.post(
            "/api/v1/edges/",
            json={
                "parent_node_id": root["id"],
                "child_node_id": opp["id"],
                "hypothesis": "Test",
                "hypothesis_type": "problem",
                "evidence": "5 user interviews",
            },
        )
        assert r.status_code == 201
        assert r.json()["evidence"] == "5 user interviews"

    def test_create_edge_default_empty_evidence(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root, opp = _add_root_and_opp(client, tree["id"])
        r = client.post(
            "/api/v1/edges/",
            json={
                "parent_node_id": root["id"],
                "child_node_id": opp["id"],
                "hypothesis": "Test",
                "hypothesis_type": "problem",
            },
        )
        assert r.status_code == 201
        assert r.json()["evidence"] == ""

    def test_update_edge_evidence(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root, opp = _add_root_and_opp(client, tree["id"])
        edge = client.post(
            "/api/v1/edges/",
            json={
                "parent_node_id": root["id"],
                "child_node_id": opp["id"],
                "hypothesis": "Hypothesis",
                "hypothesis_type": "problem",
            },
        ).json()
        r = client.patch(
            f"/api/v1/edges/{edge['id']}",
            json={"evidence": "Survey data from 200 users"},
        )
        assert r.status_code == 200
        assert r.json()["evidence"] == "Survey data from 200 users"

    def test_evidence_in_full_tree(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        root, opp = _add_root_and_opp(client, tree["id"])
        client.post(
            "/api/v1/edges/",
            json={
                "parent_node_id": root["id"],
                "child_node_id": opp["id"],
                "hypothesis": "Test",
                "hypothesis_type": "problem",
                "evidence": "Data point",
            },
        )
        r = client.get(f"/api/v1/trees/{tree['id']}")
        data = r.json()
        edges = data.get("edges", [])
        assert any(e.get("evidence") == "Data point" for e in edges)


class TestChatEndpoint:
    @patch("ost_api.routers.chat.get_llm_provider")
    def test_default_mode_uses_coach_prompt(self, mock_get_provider, client):
        """Default mode (no mode specified) should use the coach system prompt."""
        mock_provider = AsyncMock()
        mock_provider.chat_with_tools.return_value = LLMResponse(
            text="Hello from coach!", tool_calls=[], stop_reason="end_turn"
        )
        mock_get_provider.return_value = mock_provider

        project = _create_project(client)
        tree = _create_tree(client, project["id"], "Chat Test")
        r = client.post(
            "/api/v1/chat",
            json={"tree_id": tree["id"], "messages": [{"role": "user", "content": "hi"}]},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["final_text"] == "Hello from coach!"
        assert data["mode"] is None

        # Verify the system prompt passed is the coach one (not builder)
        call_kwargs = mock_provider.chat_with_tools.call_args
        assert "Opportunity Solution Tree (OST) coach" in call_kwargs.kwargs["system_prompt"]

    @patch("ost_api.routers.chat.get_llm_provider")
    def test_builder_mode_uses_builder_prompt(self, mock_get_provider, client):
        """Builder mode should use the builder system prompt."""
        mock_provider = AsyncMock()
        mock_provider.chat_with_tools.return_value = LLMResponse(
            text="Welcome to the builder!", tool_calls=[], stop_reason="end_turn"
        )
        mock_get_provider.return_value = mock_provider

        project = _create_project(client)
        tree = _create_tree(client, project["id"], "Builder Test")
        r = client.post(
            "/api/v1/chat",
            json={
                "tree_id": tree["id"],
                "messages": [{"role": "user", "content": "Let's build!"}],
                "mode": "builder",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["final_text"] == "Welcome to the builder!"
        assert data["mode"] == "builder"

        # Verify the system prompt passed is the builder one
        call_kwargs = mock_provider.chat_with_tools.call_args
        assert "guided OST Builder" in call_kwargs.kwargs["system_prompt"]

    @patch("ost_api.routers.chat.get_llm_provider")
    def test_mode_echoed_in_response(self, mock_get_provider, client):
        """Mode should be echoed back in the response."""
        mock_provider = AsyncMock()
        mock_provider.chat_with_tools.return_value = LLMResponse(
            text="ok", tool_calls=[], stop_reason="end_turn"
        )
        mock_get_provider.return_value = mock_provider

        project = _create_project(client)
        tree = _create_tree(client, project["id"], "Echo Test")

        # Test coach mode
        r = client.post(
            "/api/v1/chat",
            json={
                "tree_id": tree["id"],
                "messages": [{"role": "user", "content": "test"}],
                "mode": "coach",
            },
        )
        assert r.json()["mode"] == "coach"

        # Test builder mode
        r = client.post(
            "/api/v1/chat",
            json={
                "tree_id": tree["id"],
                "messages": [{"role": "user", "content": "test"}],
                "mode": "builder",
            },
        )
        assert r.json()["mode"] == "builder"

    @patch("ost_api.routers.chat.get_llm_provider")
    def test_update_edge_tool_in_chat(self, mock_get_provider, client):
        """The update_edge tool should be available and executable in chat."""
        from ost_core.llm.base import ToolCall

        project = _create_project(client)
        tree = _create_tree(client, project["id"], "Edge Test")
        root = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome"},
        ).json()
        opp = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Opp", "node_type": "opportunity", "parent_id": root["id"]},
        ).json()
        edge = client.post(
            "/api/v1/edges/",
            json={
                "parent_node_id": root["id"],
                "child_node_id": opp["id"],
                "hypothesis": "Test hypothesis",
                "hypothesis_type": "problem",
            },
        ).json()

        # First call: LLM requests update_edge tool
        mock_provider = AsyncMock()
        tool_call_response = LLMResponse(
            text="I'll update that edge.",
            tool_calls=[ToolCall(
                id="tc1", name="update_edge",
                arguments={"edge_id": edge["id"], "status": "validated"},
            )],
            stop_reason="tool_use",
        )
        final_response = LLMResponse(
            text="Done! The assumption is now marked as validated.",
            tool_calls=[],
            stop_reason="end_turn",
        )
        mock_provider.chat_with_tools.side_effect = [tool_call_response, final_response]
        mock_get_provider.return_value = mock_provider

        r = client.post(
            "/api/v1/chat",
            json={
                "tree_id": tree["id"],
                "messages": [{"role": "user", "content": "Mark the hypothesis as validated"}],
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert "validated" in data["final_text"]
        # Verify the tool was called
        assert mock_provider.chat_with_tools.call_count == 2

    @patch("ost_api.routers.chat.get_llm_provider")
    def test_update_edge_in_chat_tools_list(self, mock_get_provider, client):
        """Verify update_edge is in the tools list passed to the LLM."""
        mock_provider = AsyncMock()
        mock_provider.chat_with_tools.return_value = LLMResponse(
            text="ok", tool_calls=[], stop_reason="end_turn"
        )
        mock_get_provider.return_value = mock_provider

        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        client.post("/api/v1/chat", json={
            "tree_id": tree["id"],
            "messages": [{"role": "user", "content": "test"}],
        })
        call_kwargs = mock_provider.chat_with_tools.call_args
        tool_names = [t.name for t in call_kwargs.kwargs["tools"]]
        assert "update_edge" in tool_names

    @patch("ost_api.routers.chat.get_llm_provider")
    def test_project_context_in_system_prompt(self, mock_get_provider, client):
        """Project context should be injected into the chat system prompt."""
        mock_provider = AsyncMock()
        mock_provider.chat_with_tools.return_value = LLMResponse(
            text="ok", tool_calls=[], stop_reason="end_turn"
        )
        mock_get_provider.return_value = mock_provider

        project = _create_project(client)
        # Set project context
        client.patch(
            f"/api/v1/projects/{project['id']}",
            json={"project_context": "We are building a B2B SaaS product"},
        )
        tree = _create_tree(client, project["id"], "Context Test")
        # Set tree context
        client.patch(
            f"/api/v1/trees/{tree['id']}",
            json={"tree_context": "This tree focuses on onboarding"},
        )

        r = client.post(
            "/api/v1/chat",
            json={
                "tree_id": tree["id"],
                "messages": [{"role": "user", "content": "test"}],
            },
        )
        assert r.status_code == 200

        call_kwargs = mock_provider.chat_with_tools.call_args
        system_prompt = call_kwargs.kwargs["system_prompt"]
        assert "B2B SaaS product" in system_prompt
        assert "onboarding" in system_prompt
        assert "Project Context (shared across all trees" in system_prompt
        assert "Tree Context (specific to this tree)" in system_prompt


class TestGitEndpoints:
    """Tests for git export API endpoints."""

    @patch("ost_api.routers.git.get_settings")
    def test_git_status_not_configured(self, mock_settings, client):
        mock_settings.return_value = Settings(git_remote_url="", git_branch="main", user_name="", user_email="")
        project = _create_project(client)
        r = client.get(f"/api/v1/git/status/{project['id']}")
        assert r.status_code == 200
        data = r.json()
        assert data["configured"] is False
        assert data["remote_url"] == ""
        assert "token_configured" in data

    @patch("ost_api.routers.git.get_settings")
    def test_git_status_configured(self, mock_settings, client):
        mock_settings.return_value = Settings(
            git_remote_url="https://github.com/org/repo.git",
            git_branch="main",
            user_name="Test User",
            user_email="test@example.com",
        )
        project = _create_project(client)
        r = client.get(f"/api/v1/git/status/{project['id']}")
        assert r.status_code == 200
        data = r.json()
        assert data["configured"] is True
        assert data["branch"] == "main"

    @patch("ost_api.routers.git.commit_tree_to_git")
    @patch("ost_api.routers.git.get_settings")
    def test_git_commit_success(self, mock_settings, mock_commit, client):
        from ost_core.services.git_service import GitCommitResult

        mock_settings.return_value = Settings(
            git_remote_url="https://github.com/org/repo.git",
            user_name="Test",
            user_email="test@test.com",
        )
        mock_commit.return_value = GitCommitResult(
            commit_sha="abc123",
            file_path="project/tree.json",
            branch="main",
            pushed=True,
        )

        project = _create_project(client)
        tree = _create_tree(client, project["id"])

        r = client.post("/api/v1/git/commit", json={
            "tree_id": tree["id"],
            "commit_message": "test commit",
            "author_name": "Test",
            "author_email": "test@test.com",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["commit_sha"] == "abc123"
        assert data["pushed"] is True

    @patch("ost_api.routers.git.commit_tree_to_git")
    @patch("ost_api.routers.git.get_settings")
    def test_git_commit_not_configured(self, mock_settings, mock_commit, client):
        mock_settings.return_value = Settings(git_remote_url="")
        mock_commit.side_effect = GitNotConfiguredError()

        project = _create_project(client)
        tree = _create_tree(client, project["id"])

        r = client.post("/api/v1/git/commit", json={
            "tree_id": tree["id"],
            "commit_message": "test",
        })
        assert r.status_code == 400

    @patch("ost_api.routers.git.commit_tree_to_git")
    @patch("ost_api.routers.git.get_settings")
    def test_git_commit_push_conflict(self, mock_settings, mock_commit, client):
        mock_settings.return_value = Settings(
            git_remote_url="https://github.com/org/repo.git",
        )
        mock_commit.side_effect = GitPushConflictError()

        project = _create_project(client)
        tree = _create_tree(client, project["id"])

        r = client.post("/api/v1/git/commit", json={
            "tree_id": tree["id"],
            "commit_message": "test",
        })
        assert r.status_code == 409

    @patch("ost_api.routers.git.commit_tree_to_git")
    @patch("ost_api.routers.git.get_settings")
    def test_git_commit_auth_error(self, mock_settings, mock_commit, client):
        """Authentication error returns 401."""
        from ost_core.exceptions import GitAuthenticationError
        mock_settings.return_value = Settings(
            git_remote_url="https://github.com/org/repo.git",
        )
        mock_commit.side_effect = GitAuthenticationError()

        project = _create_project(client)
        tree = _create_tree(client, project["id"])

        r = client.post("/api/v1/git/commit", json={
            "tree_id": tree["id"],
            "commit_message": "test",
        })
        assert r.status_code == 401

    def test_git_commit_tree_not_found(self, client):
        r = client.post("/api/v1/git/commit", json={
            "tree_id": "00000000-0000-0000-0000-000000000000",
            "commit_message": "test",
        })
        assert r.status_code == 404

    def test_git_config_update(self, client):
        """PATCH /git/config/{project_id} saves remote_url and branch."""
        project = _create_project(client)
        r = client.patch(f"/api/v1/git/config/{project['id']}", json={
            "remote_url": "https://github.com/org/new-repo.git",
            "branch": "develop",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["configured"] is True
        assert data["branch"] == "develop"

    def test_git_authors_empty(self, client):
        """GET /git/authors/{project_id} returns empty list initially."""
        project = _create_project(client)
        r = client.get(f"/api/v1/git/authors/{project['id']}")
        assert r.status_code == 200
        assert r.json() == []

    def test_git_history_empty(self, client):
        """GET /git/history/{project_id} returns empty list initially."""
        project = _create_project(client)
        r = client.get(f"/api/v1/git/history/{project['id']}")
        assert r.status_code == 200
        assert r.json() == []


class TestFontLightAPI:
    """Tests for font_light field on tags and nodes."""

    def test_create_tag_with_font_light(self, client):
        project = _create_project(client)
        r = client.post(
            f"/api/v1/tags/project/{project['id']}",
            json={"name": "Dark BG", "color": "#1e293b", "font_light": True},
        )
        assert r.status_code == 200
        assert r.json()["font_light"] is True

    def test_create_tag_default_font_light(self, client):
        project = _create_project(client)
        r = client.post(
            f"/api/v1/tags/project/{project['id']}",
            json={"name": "Plain"},
        )
        assert r.status_code == 200
        assert r.json()["font_light"] is False

    def test_update_tag_font_light(self, client):
        project = _create_project(client)
        tag = client.post(
            f"/api/v1/tags/project/{project['id']}",
            json={"name": "Test"},
        ).json()
        r = client.patch(
            f"/api/v1/tags/{tag['id']}",
            json={"font_light": True},
        )
        assert r.status_code == 200
        assert r.json()["font_light"] is True

    def test_create_node_with_override_font_light(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        r = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome", "override_font_light": True},
        )
        assert r.status_code == 201
        assert r.json()["override_font_light"] is True

    def test_update_node_override_font_light(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        node = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome"},
        ).json()
        r = client.patch(
            f"/api/v1/nodes/{node['id']}",
            json={"override_font_light": True},
        )
        assert r.status_code == 200
        assert r.json()["override_font_light"] is True

    def test_clear_node_override_font_light(self, client):
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        node = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome", "override_font_light": True},
        ).json()
        r = client.patch(
            f"/api/v1/nodes/{node['id']}",
            json={"override_font_light": None},
        )
        assert r.status_code == 200
        assert r.json()["override_font_light"] is None


class TestOptimisticLockingAPI:
    """Tests for optimistic locking (version fields) via the API."""

    def test_get_tree_includes_version(self, client):
        """GET /trees/{id} response includes a version field."""
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        r = client.get(f"/api/v1/trees/{tree['id']}")
        assert r.status_code == 200
        data = r.json()
        assert "version" in data
        assert isinstance(data["version"], int)
        assert data["version"] >= 1

    def test_node_response_includes_version(self, client):
        """Node in tree response includes a version field."""
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        node = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome"},
        ).json()
        assert "version" in node
        assert node["version"] == 1

    def test_update_node_conflict_409(self, client):
        """PATCH /nodes/{id} with stale version returns 409."""
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        node = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome"},
        ).json()
        assert node["version"] == 1
        # First update with correct version succeeds
        r = client.patch(
            f"/api/v1/nodes/{node['id']}",
            json={"title": "Updated", "version": 1},
        )
        assert r.status_code == 200
        assert r.json()["version"] == 2
        # Second update with stale version=1 should return 409
        r2 = client.patch(
            f"/api/v1/nodes/{node['id']}",
            json={"title": "Conflict", "version": 1},
        )
        assert r2.status_code == 409

    def test_update_node_no_version_succeeds(self, client):
        """PATCH /nodes/{id} without version field succeeds (backwards compat)."""
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        node = client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome"},
        ).json()
        # Update without version field should succeed
        r = client.patch(
            f"/api/v1/nodes/{node['id']}",
            json={"title": "No Version Check"},
        )
        assert r.status_code == 200
        assert r.json()["title"] == "No Version Check"
        assert r.json()["version"] == 2

    def test_get_tree_version_endpoint(self, client):
        """GET /trees/{id}/version returns {"version": N}."""
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        r = client.get(f"/api/v1/trees/{tree['id']}/version")
        assert r.status_code == 200
        data = r.json()
        assert "version" in data
        assert data["version"] == 1

    def test_add_node_increments_tree_version(self, client):
        """POST /nodes increments the tree's version."""
        project = _create_project(client)
        tree = _create_tree(client, project["id"])
        v1 = client.get(f"/api/v1/trees/{tree['id']}/version").json()["version"]
        client.post(
            f"/api/v1/nodes?tree_id={tree['id']}",
            json={"title": "Root", "node_type": "outcome"},
        )
        v2 = client.get(f"/api/v1/trees/{tree['id']}/version").json()["version"]
        assert v2 == v1 + 1
