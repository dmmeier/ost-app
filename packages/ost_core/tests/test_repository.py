"""Tests for the TreeRepository data access layer."""

import pytest
from uuid import uuid4

from ost_core.db.repository import TreeRepository
from ost_core.exceptions import TreeNotFoundError, NodeNotFoundError
from ost_core.models import (
    EdgeHypothesisCreate,
    HypothesisType,
    NodeCreate,
    ProjectCreate,
    TreeCreate,
)


@pytest.fixture
def project(repo: TreeRepository):
    """Create a project for repo-level tests."""
    return repo.create_project(ProjectCreate(name="Test Project"))


class TestTreeCRUD:
    def test_create_tree(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", description="A test tree", project_id=project.id))
        assert tree.name == "Test"
        assert tree.description == "A test tree"
        assert tree.project_id == project.id
        assert tree.id is not None

    def test_get_tree(self, repo: TreeRepository, project):
        created = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        fetched = repo.get_tree(created.id)
        assert fetched.id == created.id
        assert fetched.name == "Test"

    def test_get_tree_not_found(self, repo: TreeRepository):
        with pytest.raises(TreeNotFoundError):
            repo.get_tree(uuid4())

    def test_list_trees(self, repo: TreeRepository, project):
        repo.create_tree(TreeCreate(name="Tree 1", project_id=project.id))
        repo.create_tree(TreeCreate(name="Tree 2", project_id=project.id))
        trees = repo.list_trees()
        assert len(trees) == 2

    def test_delete_tree(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="To Delete", project_id=project.id))
        repo.delete_tree(tree.id)
        with pytest.raises(TreeNotFoundError):
            repo.get_tree(tree.id)


class TestNodeCRUD:
    def test_add_root_node(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        node = repo.add_node(
            tree.id,
            NodeCreate(title="Root", node_type="outcome"),
        )
        assert node.title == "Root"
        assert node.parent_id is None
        assert node.tree_id == tree.id

    def test_add_child_node(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        root = repo.add_node(
            tree.id,
            NodeCreate(title="Root", node_type="outcome"),
        )
        child = repo.add_node(
            tree.id,
            NodeCreate(
                title="Child", node_type="opportunity", parent_id=root.id
            ),
        )
        assert child.parent_id == root.id

    def test_get_node(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        created = repo.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        fetched = repo.get_node(created.id)
        assert fetched.id == created.id

    def test_get_node_not_found(self, repo: TreeRepository):
        with pytest.raises(NodeNotFoundError):
            repo.get_node(uuid4())

    def test_get_children(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        root = repo.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        repo.add_node(
            tree.id,
            NodeCreate(title="Child 1", node_type="opportunity", parent_id=root.id),
        )
        repo.add_node(
            tree.id,
            NodeCreate(title="Child 2", node_type="opportunity", parent_id=root.id),
        )
        children = repo.get_children(root.id)
        assert len(children) == 2

    def test_update_node(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        node = repo.add_node(
            tree.id, NodeCreate(title="Original", node_type="outcome")
        )
        from ost_core.models import NodeUpdate

        updated = repo.update_node(node.id, NodeUpdate(title="Updated"))
        assert updated.title == "Updated"

    def test_remove_node_cascade(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        root = repo.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        child = repo.add_node(
            tree.id,
            NodeCreate(title="Child", node_type="opportunity", parent_id=root.id),
        )
        grandchild = repo.add_node(
            tree.id,
            NodeCreate(
                title="Grandchild",
                node_type="child_opportunity",
                parent_id=child.id,
            ),
        )

        repo.remove_node(child.id, cascade=True)

        with pytest.raises(NodeNotFoundError):
            repo.get_node(child.id)
        with pytest.raises(NodeNotFoundError):
            repo.get_node(grandchild.id)
        # Root should still exist
        assert repo.get_node(root.id).title == "Root"


class TestClosureTable:
    def test_self_reference(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        root = repo.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        subtree = repo.get_subtree(root.id)
        assert len(subtree) == 1
        assert subtree[0].id == root.id

    def test_subtree_query(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        root = repo.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        child = repo.add_node(
            tree.id,
            NodeCreate(title="Child", node_type="opportunity", parent_id=root.id),
        )
        grandchild = repo.add_node(
            tree.id,
            NodeCreate(
                title="Grandchild",
                node_type="child_opportunity",
                parent_id=child.id,
            ),
        )

        subtree = repo.get_subtree(root.id)
        assert len(subtree) == 3
        subtree_ids = {n.id for n in subtree}
        assert root.id in subtree_ids
        assert child.id in subtree_ids
        assert grandchild.id in subtree_ids

    def test_ancestors_query(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        root = repo.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        child = repo.add_node(
            tree.id,
            NodeCreate(title="Child", node_type="opportunity", parent_id=root.id),
        )
        grandchild = repo.add_node(
            tree.id,
            NodeCreate(
                title="Grandchild",
                node_type="child_opportunity",
                parent_id=child.id,
            ),
        )

        ancestors = repo.get_ancestors(grandchild.id)
        assert len(ancestors) == 2
        assert ancestors[0].id == root.id  # Root first
        assert ancestors[1].id == child.id

    def test_get_depth(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        root = repo.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        child = repo.add_node(
            tree.id,
            NodeCreate(title="Child", node_type="opportunity", parent_id=root.id),
        )
        grandchild = repo.add_node(
            tree.id,
            NodeCreate(
                title="Grandchild",
                node_type="child_opportunity",
                parent_id=child.id,
            ),
        )

        assert repo.get_depth(root.id) == 0
        assert repo.get_depth(child.id) == 1
        assert repo.get_depth(grandchild.id) == 2

    def test_get_leaves(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        root = repo.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        child1 = repo.add_node(
            tree.id,
            NodeCreate(title="Child 1", node_type="opportunity", parent_id=root.id),
        )
        child2 = repo.add_node(
            tree.id,
            NodeCreate(title="Child 2", node_type="opportunity", parent_id=root.id),
        )

        leaves = repo.get_leaves(tree.id)
        assert len(leaves) == 2
        leaf_ids = {n.id for n in leaves}
        assert child1.id in leaf_ids
        assert child2.id in leaf_ids

    def test_move_subtree(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        root = repo.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        opp1 = repo.add_node(
            tree.id,
            NodeCreate(title="Opp 1", node_type="opportunity", parent_id=root.id),
        )
        opp2 = repo.add_node(
            tree.id,
            NodeCreate(title="Opp 2", node_type="opportunity", parent_id=root.id),
        )
        child = repo.add_node(
            tree.id,
            NodeCreate(
                title="Child of Opp1",
                node_type="child_opportunity",
                parent_id=opp1.id,
            ),
        )

        # Move child from opp1 to opp2
        repo.move_subtree(child.id, opp2.id)

        # Verify parent changed
        moved = repo.get_node(child.id)
        assert moved.parent_id == opp2.id

        # Verify ancestors updated
        ancestors = repo.get_ancestors(child.id)
        ancestor_ids = [a.id for a in ancestors]
        assert root.id in ancestor_ids
        assert opp2.id in ancestor_ids
        assert opp1.id not in ancestor_ids


class TestEdgeHypothesis:
    def test_set_edge_hypothesis(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        root = repo.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        child = repo.add_node(
            tree.id,
            NodeCreate(title="Child", node_type="opportunity", parent_id=root.id),
        )

        edge = repo.set_edge_hypothesis(
            EdgeHypothesisCreate(
                parent_node_id=root.id,
                child_node_id=child.id,
                hypothesis="Fixing this will drive the outcome",
                hypothesis_type=HypothesisType.PROBLEM,
            )
        )
        assert edge.hypothesis == "Fixing this will drive the outcome"
        assert edge.is_risky is False

    def test_multiple_assumptions_per_edge(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        root = repo.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        child = repo.add_node(
            tree.id,
            NodeCreate(title="Child", node_type="opportunity", parent_id=root.id),
        )

        # Add first assumption
        edge1 = repo.set_edge_hypothesis(
            EdgeHypothesisCreate(
                parent_node_id=root.id,
                child_node_id=child.id,
                hypothesis="First assumption",
                hypothesis_type=HypothesisType.PROBLEM,
            )
        )
        # Add second assumption on same edge
        edge2 = repo.set_edge_hypothesis(
            EdgeHypothesisCreate(
                parent_node_id=root.id,
                child_node_id=child.id,
                hypothesis="Second assumption",
                hypothesis_type=HypothesisType.DESIRABILITY,
                is_risky=True,
            )
        )
        assert edge1.id != edge2.id
        assert edge1.hypothesis == "First assumption"
        assert edge2.hypothesis == "Second assumption"
        # Both should be in the tree's edges
        edges = repo.get_edges_for_tree(tree.id)
        assert len(edges) == 2

    def test_get_edge_hypothesis(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        root = repo.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        child = repo.add_node(
            tree.id,
            NodeCreate(title="Child", node_type="opportunity", parent_id=root.id),
        )
        repo.set_edge_hypothesis(
            EdgeHypothesisCreate(
                parent_node_id=root.id,
                child_node_id=child.id,
                hypothesis="Test",
                hypothesis_type=HypothesisType.PROBLEM,
            )
        )

        edge = repo.get_edge_hypothesis(root.id, child.id)
        assert edge is not None
        assert edge.hypothesis == "Test"

        # Non-existent edge
        missing = repo.get_edge_hypothesis(child.id, root.id)
        assert missing is None

    def test_get_full_tree_includes_edges(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        root = repo.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        child = repo.add_node(
            tree.id,
            NodeCreate(title="Child", node_type="opportunity", parent_id=root.id),
        )
        repo.set_edge_hypothesis(
            EdgeHypothesisCreate(
                parent_node_id=root.id,
                child_node_id=child.id,
                hypothesis="Test",
                hypothesis_type=HypothesisType.PROBLEM,
            )
        )

        full_tree = repo.get_full_tree(tree.id)
        assert len(full_tree.nodes) == 2
        assert len(full_tree.edges) == 1


class TestNodeStyleOverrides:
    def test_create_node_with_overrides(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        node = repo.add_node(
            tree.id,
            NodeCreate(
                title="Styled",
                node_type="outcome",
                override_border_color="#ff0000",
                override_border_width=4.0,
                override_fill_color="#00ff00",
                override_fill_style="solid",
            ),
        )
        assert node.override_border_color == "#ff0000"
        assert node.override_border_width == 4.0
        assert node.override_fill_color == "#00ff00"
        assert node.override_fill_style == "solid"

    def test_create_node_without_overrides(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        node = repo.add_node(
            tree.id,
            NodeCreate(title="Plain", node_type="outcome"),
        )
        assert node.override_border_color is None
        assert node.override_border_width is None
        assert node.override_fill_color is None
        assert node.override_fill_style is None

    def test_update_node_overrides(self, repo: TreeRepository, project):
        from ost_core.models import NodeUpdate

        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        node = repo.add_node(
            tree.id,
            NodeCreate(title="Node", node_type="outcome"),
        )
        updated = repo.update_node(
            node.id,
            NodeUpdate(
                override_border_color="#ff0000",
                override_fill_style="solid",
            ),
        )
        assert updated.override_border_color == "#ff0000"
        assert updated.override_fill_style == "solid"
        assert updated.override_border_width is None  # Not set

    def test_clear_node_overrides(self, repo: TreeRepository, project):
        from ost_core.models import NodeUpdate

        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        node = repo.add_node(
            tree.id,
            NodeCreate(
                title="Node",
                node_type="outcome",
                override_border_color="#ff0000",
                override_fill_style="solid",
            ),
        )
        assert node.override_border_color == "#ff0000"

        # Clear by sending empty string
        cleared = repo.update_node(
            node.id,
            NodeUpdate(override_border_color="", override_fill_style=""),
        )
        assert cleared.override_border_color is None
        assert cleared.override_fill_style is None

    def test_overrides_persist_in_full_tree(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        repo.add_node(
            tree.id,
            NodeCreate(
                title="Styled Root",
                node_type="outcome",
                override_border_color="#ff0000",
                override_fill_style="solid",
            ),
        )
        full_tree = repo.get_full_tree(tree.id)
        assert len(full_tree.nodes) == 1
        assert full_tree.nodes[0].override_border_color == "#ff0000"
        assert full_tree.nodes[0].override_fill_style == "solid"


class TestFontLight:
    def test_create_node_with_override_font_light(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        node = repo.add_node(
            tree.id,
            NodeCreate(title="Light", node_type="outcome", override_font_light=True),
        )
        assert node.override_font_light is True

    def test_create_node_without_override_font_light(self, repo: TreeRepository, project):
        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        node = repo.add_node(
            tree.id,
            NodeCreate(title="Default", node_type="outcome"),
        )
        assert node.override_font_light is None

    def test_update_node_override_font_light(self, repo: TreeRepository, project):
        from ost_core.models import NodeUpdate

        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        node = repo.add_node(
            tree.id,
            NodeCreate(title="Node", node_type="outcome"),
        )
        updated = repo.update_node(node.id, NodeUpdate(override_font_light=True))
        assert updated.override_font_light is True

    def test_clear_node_override_font_light(self, repo: TreeRepository, project):
        from ost_core.models import NodeUpdate

        tree = repo.create_tree(TreeCreate(name="Test", project_id=project.id))
        node = repo.add_node(
            tree.id,
            NodeCreate(title="Node", node_type="outcome", override_font_light=True),
        )
        assert node.override_font_light is True
        cleared = repo.update_node(node.id, NodeUpdate(override_font_light=None))
        assert cleared.override_font_light is None

    def test_create_tag_with_font_light(self, repo: TreeRepository, project):
        from ost_core.models import TagCreate

        tag = repo.create_tag(
            project.id,
            TagCreate(name="highlight", color="#ff0000", font_light=True),
        )
        assert tag.font_light is True

    def test_create_tag_default_font_light(self, repo: TreeRepository, project):
        from ost_core.models import TagCreate

        tag = repo.create_tag(project.id, TagCreate(name="plain"))
        assert tag.font_light is False

    def test_update_tag_font_light(self, repo: TreeRepository, project):
        from ost_core.models import TagCreate, TagUpdate

        tag = repo.create_tag(project.id, TagCreate(name="test"))
        assert tag.font_light is False
        updated = repo.update_tag(tag.id, TagUpdate(font_light=True))
        assert updated.font_light is True
