"""Tests for the Typer CLI."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from typer.testing import CliRunner

from ost_core.db.schema import Base
from ost_core.db.repository import TreeRepository
from ost_core.models import (
    EdgeHypothesisCreate,
    HypothesisType,
    NodeCreate,
    ProjectCreate,
    TreeCreate,
)
from ost_core.services.tree_service import TreeService

runner = CliRunner()


@pytest.fixture
def service():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    sf = sessionmaker(bind=engine)
    repo = TreeRepository(sf)
    return TreeService(repo)


@pytest.fixture
def populated(service):
    """Create project, tree, outcome, opportunity, solution, and an edge."""
    project = service.create_project(ProjectCreate(name="Test Project"))
    tree = service.create_tree(TreeCreate(name="Test Tree", project_id=project.id))
    outcome = service.add_node(tree.id, NodeCreate(title="Increase DAU", node_type="outcome"))
    opp = service.add_node(tree.id, NodeCreate(title="Users churn", node_type="opportunity", parent_id=outcome.id))
    sol = service.add_node(tree.id, NodeCreate(title="Better onboarding", node_type="solution", parent_id=opp.id))
    edge = service.set_edge_hypothesis(EdgeHypothesisCreate(
        parent_node_id=outcome.id, child_node_id=opp.id,
        hypothesis="Churn is the main blocker", hypothesis_type=HypothesisType.PROBLEM, is_risky=True,
    ))
    return {"service": service, "project": project, "tree": tree, "outcome": outcome, "opp": opp, "sol": sol, "edge": edge}


@pytest.fixture(autouse=True)
def _patch_service(monkeypatch, populated):
    """Patch CLI's _get_service to return our test service."""
    import ost_cli.main as cli_mod
    monkeypatch.setattr(cli_mod, "_get_service", lambda: populated["service"])
    monkeypatch.setattr(cli_mod, "_get_validator", lambda: None)  # Not needed for most tests


class TestEdgeCommands:
    def test_edge_set(self, populated):
        from ost_cli.main import app
        result = runner.invoke(app, [
            "edge", "set",
            str(populated["outcome"].id),
            str(populated["opp"].id),
            "New assumption",
            "--type", "solution",
        ])
        assert result.exit_code == 0
        assert "Edge set" in result.output

    def test_edge_list(self, populated):
        from ost_cli.main import app
        result = runner.invoke(app, ["edge", "list", str(populated["tree"].id)])
        assert result.exit_code == 0
        assert "Edge Hypotheses" in result.output
        assert "problem" in result.output

    def test_edge_update(self, populated):
        from ost_cli.main import app
        result = runner.invoke(app, [
            "edge", "update", str(populated["edge"].id),
            "--status", "validated",
        ])
        assert result.exit_code == 0
        assert "Updated edge" in result.output



class TestEditCommand:
    def test_edit_title(self, populated):
        from ost_cli.main import app
        result = runner.invoke(app, [
            "edit", str(populated["opp"].id), "--title", "Revised title",
        ])
        assert result.exit_code == 0
        assert "Revised title" in result.output

    def test_edit_status(self, populated):
        from ost_cli.main import app
        result = runner.invoke(app, [
            "edit", str(populated["sol"].id), "--status", "archived",
        ])
        assert result.exit_code == 0
        assert "Updated" in result.output


class TestProjectUpdate:
    def test_project_update(self, populated):
        from ost_cli.main import app
        result = runner.invoke(app, [
            "project", "update", str(populated["project"].id),
            "--name", "New Name",
        ])
        assert result.exit_code == 0
        assert "Updated project" in result.output


class TestDeleteTree:
    def test_delete_tree_force(self, populated):
        from ost_cli.main import app
        result = runner.invoke(app, [
            "delete", str(populated["tree"].id), "--force",
        ])
        assert result.exit_code == 0
        assert "Deleted tree" in result.output


class TestContextCommands:
    def test_context_show(self, populated):
        from ost_cli.main import app
        result = runner.invoke(app, ["context", str(populated["tree"].id)])
        assert result.exit_code == 0
        assert "No project context" in result.output or "Test Tree" in result.output

    def test_set_context_tree(self, populated):
        from ost_cli.main import app
        result = runner.invoke(app, [
            "set-context", str(populated["tree"].id),
            "--tree", "We focus on retention",
        ])
        assert result.exit_code == 0
        assert "Updated tree context" in result.output

    def test_set_context_project(self, populated):
        from ost_cli.main import app
        result = runner.invoke(app, [
            "set-context", str(populated["tree"].id),
            "--project", "B2B SaaS product",
        ])
        assert result.exit_code == 0
        assert "Updated project context" in result.output


class TestNodeCommands:
    def test_show_node(self, populated):
        from ost_cli.main import app
        result = runner.invoke(app, ["node", str(populated["outcome"].id)])
        assert result.exit_code == 0
        assert "Increase DAU" in result.output

    def test_show_subtree(self, populated):
        from ost_cli.main import app
        result = runner.invoke(app, ["subtree", str(populated["outcome"].id)])
        assert result.exit_code == 0
        assert "Increase DAU" in result.output
        assert "Users churn" in result.output

    def test_show_leaves(self, populated):
        from ost_cli.main import app
        result = runner.invoke(app, ["leaves", str(populated["tree"].id)])
        assert result.exit_code == 0
        assert "Better onboarding" in result.output

    def test_show_ancestors(self, populated):
        from ost_cli.main import app
        result = runner.invoke(app, ["ancestors", str(populated["sol"].id)])
        assert result.exit_code == 0
        assert "Increase DAU" in result.output

    def test_merge(self, populated):
        from ost_cli.main import app
        svc = populated["service"]
        # Create a second tree
        tree2 = svc.create_tree(TreeCreate(name="Source", project_id=populated["project"].id))
        root2 = svc.add_node(tree2.id, NodeCreate(title="Other Outcome", node_type="outcome"))
        svc.add_node(tree2.id, NodeCreate(title="Other Opp", node_type="opportunity", parent_id=root2.id))
        result = runner.invoke(app, [
            "merge", str(tree2.id), str(populated["tree"].id), str(populated["outcome"].id),
        ])
        assert result.exit_code == 0
        assert "Merged" in result.output


class TestCreateWithContext:
    def test_create_with_context(self, populated):
        from ost_cli.main import app
        result = runner.invoke(app, [
            "create", "New Tree",
            "--project-id", str(populated["project"].id),
            "--context", "Focus on mobile users",
        ])
        assert result.exit_code == 0
        assert "Created tree" in result.output
