"""Tests for activity logging and change attribution features."""

import pytest

from ost_core.auth import hash_password
from ost_core.db.repository import TreeRepository
from ost_core.models import NodeCreate, NodeUpdate, ProjectCreate, TreeCreate
from ost_core.services.tree_service import TreeService


def _make_user(repo: TreeRepository, suffix: str = "1"):
    """Helper to create a test user and return it."""
    pw_hash = hash_password(f"testpass{suffix}")
    return repo.create_user(
        email=f"user{suffix}@example.com",
        display_name=f"Test User {suffix}",
        password_hash=pw_hash,
    )


def _make_project_and_tree(repo: TreeRepository, user_id: str | None = None):
    """Helper to create a project and tree, returning (project, tree)."""
    project = repo.create_project(ProjectCreate(name="Activity Test Project"))
    tree = repo.create_tree(
        TreeCreate(name="Activity Test Tree", project_id=project.id),
        user_id=user_id,
    )
    return project, tree


class TestActivityLogging:
    """Tests for activity logging and last_modified_by attribution."""

    # ── 1. add_node sets last_modified_by ────────────────────

    def test_add_node_sets_last_modified_by(self, repo: TreeRepository):
        user = _make_user(repo, "add_node_lmb")
        _project, tree = _make_project_and_tree(repo)

        node = repo.add_node(
            tree.id,
            NodeCreate(title="Attributed Node", node_type="outcome"),
            user_id=str(user.id),
        )

        assert node.last_modified_by == user.id

    # ── 2. update_node sets last_modified_by ─────────────────

    def test_update_node_sets_last_modified_by(self, repo: TreeRepository):
        user = _make_user(repo, "update_node_lmb")
        _project, tree = _make_project_and_tree(repo)

        # Create node without user_id
        node = repo.add_node(
            tree.id,
            NodeCreate(title="Original Title", node_type="outcome"),
        )
        assert node.last_modified_by is None

        # Update node with user_id
        updated = repo.update_node(
            node.id,
            NodeUpdate(title="Updated Title", version=node.version),
            user_id=str(user.id),
        )

        assert updated.last_modified_by == user.id

    # ── 3. add_node logs activity ────────────────────────────

    def test_add_node_logs_activity(self, repo: TreeRepository):
        user = _make_user(repo, "add_node_log")
        _project, tree = _make_project_and_tree(repo)

        repo.add_node(
            tree.id,
            NodeCreate(title="Logged Node", node_type="outcome"),
            user_id=str(user.id),
        )

        activities = repo.list_activity(tree_id=tree.id)
        # Should have at least a node_created entry (and a tree_created one)
        node_created = [a for a in activities if a.action == "node_created"]
        assert len(node_created) == 1
        assert node_created[0].user_display_name == user.display_name
        assert node_created[0].resource_type == "node"
        assert "Logged Node" in node_created[0].summary

    # ── 4. update_node logs activity with diff ───────────────

    def test_update_node_logs_activity_with_diff(self, repo: TreeRepository):
        user = _make_user(repo, "update_node_log")
        _project, tree = _make_project_and_tree(repo)

        node = repo.add_node(
            tree.id,
            NodeCreate(title="Before", node_type="outcome"),
            user_id=str(user.id),
        )

        repo.update_node(
            node.id,
            NodeUpdate(title="After", version=node.version),
            user_id=str(user.id),
        )

        activities = repo.list_activity(tree_id=tree.id)
        node_updated = [a for a in activities if a.action == "node_updated"]
        assert len(node_updated) == 1

        entry = node_updated[0]
        assert entry.details is not None
        assert "title" in entry.details.get("changed_fields", [])

    # ── 5. delete_node logs activity ─────────────────────────

    def test_delete_node_logs_activity(self, repo: TreeRepository):
        user = _make_user(repo, "delete_node_log")
        _project, tree = _make_project_and_tree(repo)

        node = repo.add_node(
            tree.id,
            NodeCreate(title="Doomed Node", node_type="outcome"),
            user_id=str(user.id),
        )

        repo.remove_node(node.id, user_id=str(user.id))

        activities = repo.list_activity(tree_id=tree.id)
        node_deleted = [a for a in activities if a.action == "node_deleted"]
        assert len(node_deleted) == 1
        assert node_deleted[0].user_display_name == user.display_name
        assert "Doomed Node" in node_deleted[0].summary

    # ── 6. move_subtree logs activity ────────────────────────

    def test_move_subtree_logs_activity(self, repo: TreeRepository):
        user = _make_user(repo, "move_subtree_log")
        _project, tree = _make_project_and_tree(repo)

        parent = repo.add_node(
            tree.id,
            NodeCreate(title="Parent", node_type="outcome"),
            user_id=str(user.id),
        )
        child_a = repo.add_node(
            tree.id,
            NodeCreate(
                title="Child A",
                node_type="opportunity",
                parent_id=parent.id,
            ),
            user_id=str(user.id),
        )
        child_b = repo.add_node(
            tree.id,
            NodeCreate(
                title="Child B",
                node_type="opportunity",
                parent_id=parent.id,
            ),
            user_id=str(user.id),
        )

        # Move child_a under child_b
        repo.move_subtree(child_a.id, child_b.id, user_id=str(user.id))

        activities = repo.list_activity(tree_id=tree.id)
        node_moved = [a for a in activities if a.action == "node_moved"]
        assert len(node_moved) == 1
        assert node_moved[0].user_display_name == user.display_name
        assert "Child A" in node_moved[0].summary

    # ── 7. list_activity filters by tree ─────────────────────

    def test_list_activity_by_tree(self, repo: TreeRepository):
        user = _make_user(repo, "filter_tree")
        project = repo.create_project(ProjectCreate(name="Multi-tree Project"))

        tree1 = repo.create_tree(
            TreeCreate(name="Tree 1", project_id=project.id),
            user_id=str(user.id),
        )
        tree2 = repo.create_tree(
            TreeCreate(name="Tree 2", project_id=project.id),
            user_id=str(user.id),
        )

        repo.add_node(
            tree1.id,
            NodeCreate(title="Node in Tree 1", node_type="outcome"),
            user_id=str(user.id),
        )
        repo.add_node(
            tree2.id,
            NodeCreate(title="Node in Tree 2", node_type="outcome"),
            user_id=str(user.id),
        )

        tree1_activities = repo.list_activity(tree_id=tree1.id)
        tree2_activities = repo.list_activity(tree_id=tree2.id)

        # Each tree should have its own activities (tree_created + node_created)
        tree1_node_acts = [a for a in tree1_activities if a.action == "node_created"]
        tree2_node_acts = [a for a in tree2_activities if a.action == "node_created"]

        assert len(tree1_node_acts) == 1
        assert len(tree2_node_acts) == 1
        assert "Tree 1" in tree1_node_acts[0].summary
        assert "Tree 2" in tree2_node_acts[0].summary

        # Make sure tree1 activities don't contain tree2 node activity
        all_summaries_t1 = [a.summary for a in tree1_activities]
        assert not any("Node in Tree 2" in s for s in all_summaries_t1)

    # ── 8. list_activity filters by project ──────────────────

    def test_list_activity_by_project(self, repo: TreeRepository):
        user = _make_user(repo, "filter_project")
        project = repo.create_project(ProjectCreate(name="Project for Activity"))

        tree = repo.create_tree(
            TreeCreate(name="Project Tree", project_id=project.id),
            user_id=str(user.id),
        )

        repo.add_node(
            tree.id,
            NodeCreate(title="Project Node", node_type="outcome"),
            user_id=str(user.id),
        )

        activities = repo.list_activity(project_id=project.id)
        assert len(activities) >= 2  # At least tree_created + node_created

        actions = [a.action for a in activities]
        assert "tree_created" in actions
        assert "node_created" in actions

    # ── 9. activity log respects limit ───────────────────────

    def test_activity_log_limit(self, repo: TreeRepository):
        user = _make_user(repo, "limit_test")
        _project, tree = _make_project_and_tree(repo)

        # Create 5 nodes to generate 5 node_created activity entries
        for i in range(5):
            repo.add_node(
                tree.id,
                NodeCreate(title=f"Limit Node {i}", node_type="outcome"),
                user_id=str(user.id),
            )

        # Total activities: 1 tree_created + 5 node_created = 6
        all_activities = repo.list_activity(tree_id=tree.id, limit=100)
        assert len(all_activities) >= 6

        # With limit=2, should get exactly 2
        limited = repo.list_activity(tree_id=tree.id, limit=2)
        assert len(limited) == 2

    # ── 10. open mode: null user_id ──────────────────────────

    def test_open_mode_null_user_id(self, repo: TreeRepository):
        _project, tree = _make_project_and_tree(repo)

        node = repo.add_node(
            tree.id,
            NodeCreate(title="Anonymous Node", node_type="outcome"),
            # No user_id -- open mode
        )

        assert node.last_modified_by is None

        # Activity should still be logged, with empty user_display_name
        activities = repo.list_activity(tree_id=tree.id)
        node_created = [a for a in activities if a.action == "node_created"]
        assert len(node_created) == 1
        assert node_created[0].user_display_name == ""
        assert node_created[0].user_id is None

    # ── 11. get_full_tree resolves last_modified_by_name ─────

    def test_full_tree_resolves_last_modified_by_name(self, repo: TreeRepository):
        user = _make_user(repo, "full_tree_resolve")
        _project, tree = _make_project_and_tree(repo)

        repo.add_node(
            tree.id,
            NodeCreate(title="Attributed in Full Tree", node_type="outcome"),
            user_id=str(user.id),
        )

        full_tree = repo.get_full_tree(tree.id)
        assert len(full_tree.nodes) == 1

        resolved_node = full_tree.nodes[0]
        assert resolved_node.last_modified_by == user.id
        assert resolved_node.last_modified_by_name == user.display_name

    # ── 12. create_tree sets last_modified_by ────────────────

    def test_create_tree_sets_last_modified_by(self, repo: TreeRepository):
        user = _make_user(repo, "create_tree_lmb")
        project = repo.create_project(ProjectCreate(name="Tree LMB Project"))

        tree = repo.create_tree(
            TreeCreate(name="Attributed Tree", project_id=project.id),
            user_id=str(user.id),
        )

        assert tree.last_modified_by == user.id


class TestActivityServiceLayer:
    """Tests for the service-level activity methods."""

    def test_get_tree_activity(self, repo: TreeRepository, service: TreeService):
        user = _make_user(repo, "svc_tree_act")
        project = repo.create_project(ProjectCreate(name="Service Tree Activity"))

        tree = repo.create_tree(
            TreeCreate(name="Service Tree", project_id=project.id),
            user_id=str(user.id),
        )
        repo.add_node(
            tree.id,
            NodeCreate(title="Service Node", node_type="outcome"),
            user_id=str(user.id),
        )

        activities = service.get_tree_activity(tree.id, limit=50)
        assert len(activities) >= 2
        actions = [a.action for a in activities]
        assert "tree_created" in actions
        assert "node_created" in actions

    def test_get_project_activity(self, repo: TreeRepository, service: TreeService):
        user = _make_user(repo, "svc_proj_act")
        project = repo.create_project(ProjectCreate(name="Service Project Activity"))

        tree = repo.create_tree(
            TreeCreate(name="Service Project Tree", project_id=project.id),
            user_id=str(user.id),
        )
        repo.add_node(
            tree.id,
            NodeCreate(title="Service Project Node", node_type="outcome"),
            user_id=str(user.id),
        )

        activities = service.get_project_activity(project.id, limit=50)
        assert len(activities) >= 2
        actions = [a.action for a in activities]
        assert "tree_created" in actions
        assert "node_created" in actions

    def test_service_activity_limit(self, repo: TreeRepository, service: TreeService):
        user = _make_user(repo, "svc_limit")
        project = repo.create_project(ProjectCreate(name="Service Limit Project"))

        tree = repo.create_tree(
            TreeCreate(name="Service Limit Tree", project_id=project.id),
            user_id=str(user.id),
        )
        for i in range(5):
            repo.add_node(
                tree.id,
                NodeCreate(title=f"Service Limit Node {i}", node_type="outcome"),
                user_id=str(user.id),
            )

        limited = service.get_tree_activity(tree.id, limit=3)
        assert len(limited) == 3

    def test_service_activity_returns_newest_first(
        self, repo: TreeRepository, service: TreeService
    ):
        user = _make_user(repo, "svc_order")
        project = repo.create_project(ProjectCreate(name="Order Test Project"))

        tree = repo.create_tree(
            TreeCreate(name="Order Tree", project_id=project.id),
            user_id=str(user.id),
        )
        repo.add_node(
            tree.id,
            NodeCreate(title="First Node", node_type="outcome"),
            user_id=str(user.id),
        )
        repo.add_node(
            tree.id,
            NodeCreate(title="Second Node", node_type="outcome"),
            user_id=str(user.id),
        )

        activities = service.get_tree_activity(tree.id, limit=50)
        # Newest first: the most recent activity is at index 0
        assert activities[0].created_at >= activities[-1].created_at

        # The most recent node_created should be for "Second Node"
        node_activities = [a for a in activities if a.action == "node_created"]
        assert "Second Node" in node_activities[0].summary
