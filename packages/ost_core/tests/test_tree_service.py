"""Tests for TreeService business logic."""

import pytest
from uuid import uuid4

from ost_core.exceptions import (
    DuplicateRootError,
    InvalidMoveError,
    InvalidNodeTypeError,
    ProjectNotFoundError,
)
from ost_core.models import (
    BubbleTypeDefault,
    EdgeHypothesisCreate,
    EdgeHypothesisUpdate,
    HypothesisType,
    NodeCreate,
    ProjectCreate,
    ProjectUpdate,
    Tag,
    TagCreate,
    TagUpdate,
    TreeCreate,
)
from ost_core.services.tree_service import TreeService


class TestProjectCRUD:
    def test_create_project(self, service: TreeService):
        project = service.create_project(ProjectCreate(name="Test Project"))
        assert project.name == "Test Project"
        assert project.id is not None

    def test_list_projects(self, service: TreeService):
        service.create_project(ProjectCreate(name="Project 1"))
        service.create_project(ProjectCreate(name="Project 2"))
        projects = service.list_projects()
        assert len(projects) == 2

    def test_get_project(self, service: TreeService):
        created = service.create_project(ProjectCreate(name="Test"))
        fetched = service.get_project(created.id)
        assert fetched.id == created.id
        assert fetched.name == "Test"

    def test_update_project(self, service: TreeService):
        project = service.create_project(ProjectCreate(name="Old Name"))
        updated = service.update_project(project.id, ProjectUpdate(name="New Name"))
        assert updated.name == "New Name"

    def test_update_project_context(self, service: TreeService):
        project = service.create_project(ProjectCreate(name="Test"))
        updated = service.update_project(
            project.id, ProjectUpdate(project_context="Some context")
        )
        assert updated.project_context == "Some context"

    def test_delete_project(self, service: TreeService):
        project = service.create_project(ProjectCreate(name="To Delete"))
        service.delete_project(project.id)
        with pytest.raises(ProjectNotFoundError):
            service.get_project(project.id)

    def test_delete_project_cascades_trees(self, service: TreeService):
        project = service.create_project(ProjectCreate(name="Test"))
        tree = service.create_tree(TreeCreate(name="Tree", project_id=project.id))
        service.delete_project(project.id)
        trees = service.list_trees()
        assert len(trees) == 0

    def test_get_project_with_trees(self, service: TreeService):
        project = service.create_project(ProjectCreate(name="Test"))
        service.create_tree(TreeCreate(name="Tree 1", project_id=project.id))
        service.create_tree(TreeCreate(name="Tree 2", project_id=project.id))
        result = service.get_project_with_trees(project.id)
        assert len(result.trees) == 2

    def test_get_project_not_found(self, service: TreeService):
        with pytest.raises(ProjectNotFoundError):
            service.get_project(uuid4())


class TestBubbleDefaults:
    def test_project_created_without_bubble_defaults(self, service: TreeService):
        project = service.create_project(ProjectCreate(name="Test"))
        assert project.bubble_defaults is None

    def test_set_bubble_defaults(self, service: TreeService):
        project = service.create_project(ProjectCreate(name="Test"))
        defaults = {
            "outcome": BubbleTypeDefault(border_color="#ff0000", border_width=3.0),
            "opportunity": BubbleTypeDefault(border_color="#00ff00", border_width=1.5),
        }
        updated = service.update_project(
            project.id, ProjectUpdate(bubble_defaults=defaults)
        )
        assert updated.bubble_defaults is not None
        assert updated.bubble_defaults["outcome"].border_color == "#ff0000"
        assert updated.bubble_defaults["outcome"].border_width == 3.0
        assert updated.bubble_defaults["opportunity"].border_color == "#00ff00"
        assert updated.bubble_defaults["opportunity"].border_width == 1.5

    def test_bubble_defaults_persist_after_read(self, service: TreeService):
        project = service.create_project(ProjectCreate(name="Test"))
        defaults = {
            "outcome": BubbleTypeDefault(border_color="#abcdef", border_width=4.0),
        }
        service.update_project(project.id, ProjectUpdate(bubble_defaults=defaults))
        fetched = service.get_project(project.id)
        assert fetched.bubble_defaults is not None
        assert fetched.bubble_defaults["outcome"].border_color == "#abcdef"
        assert fetched.bubble_defaults["outcome"].border_width == 4.0

    def test_bubble_defaults_in_project_with_trees(self, service: TreeService):
        project = service.create_project(ProjectCreate(name="Test"))
        defaults = {
            "solution": BubbleTypeDefault(border_color="#123456", border_width=2.5),
        }
        service.update_project(project.id, ProjectUpdate(bubble_defaults=defaults))
        result = service.get_project_with_trees(project.id)
        assert result.bubble_defaults is not None
        assert result.bubble_defaults["solution"].border_color == "#123456"

    def test_update_bubble_defaults_replaces_fully(self, service: TreeService):
        project = service.create_project(ProjectCreate(name="Test"))
        defaults_v1 = {
            "outcome": BubbleTypeDefault(border_color="#111111", border_width=1.0),
        }
        service.update_project(project.id, ProjectUpdate(bubble_defaults=defaults_v1))

        defaults_v2 = {
            "experiment": BubbleTypeDefault(border_color="#222222", border_width=5.0),
        }
        updated = service.update_project(
            project.id, ProjectUpdate(bubble_defaults=defaults_v2)
        )
        # The entire bubble_defaults dict is replaced, not merged
        assert "outcome" not in updated.bubble_defaults
        assert updated.bubble_defaults["experiment"].border_color == "#222222"

    def test_update_other_fields_preserves_bubble_defaults(self, service: TreeService):
        project = service.create_project(ProjectCreate(name="Test"))
        defaults = {
            "outcome": BubbleTypeDefault(border_color="#aabbcc", border_width=2.0),
        }
        service.update_project(project.id, ProjectUpdate(bubble_defaults=defaults))
        # Update name only (bubble_defaults=None means "don't change")
        updated = service.update_project(project.id, ProjectUpdate(name="New Name"))
        assert updated.name == "New Name"
        assert updated.bubble_defaults is not None
        assert updated.bubble_defaults["outcome"].border_color == "#aabbcc"


class TestTypeConstraints:
    def test_root_must_be_outcome(self, service: TreeService, sample_project):
        tree = service.create_tree(TreeCreate(name="Test", project_id=sample_project.id))
        with pytest.raises(InvalidNodeTypeError):
            service.add_node(
                tree.id,
                NodeCreate(title="Bad Root", node_type="solution"),
            )

    def test_duplicate_root_rejected(self, service: TreeService, sample_project):
        tree = service.create_tree(TreeCreate(name="Test", project_id=sample_project.id))
        service.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        with pytest.raises(DuplicateRootError):
            service.add_node(
                tree.id, NodeCreate(title="Root 2", node_type="outcome")
            )

    def test_outcome_accepts_opportunity(self, service: TreeService, sample_project):
        tree = service.create_tree(TreeCreate(name="Test", project_id=sample_project.id))
        root = service.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        child = service.add_node(
            tree.id,
            NodeCreate(title="Opp", node_type="opportunity", parent_id=root.id),
        )
        assert child.node_type == "opportunity"

    def test_outcome_accepts_solution(self, service: TreeService, sample_project):
        """Type constraints removed — any type can be a child of any other type."""
        tree = service.create_tree(TreeCreate(name="Test", project_id=sample_project.id))
        root = service.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        child = service.add_node(
            tree.id,
            NodeCreate(
                title="Sol", node_type="solution", parent_id=root.id
            ),
        )
        assert child.node_type == "solution"
        assert child.parent_id == root.id

    def test_opportunity_accepts_child_opportunity(self, service: TreeService, sample_project):
        tree = service.create_tree(TreeCreate(name="Test", project_id=sample_project.id))
        root = service.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        opp = service.add_node(
            tree.id,
            NodeCreate(title="Opp", node_type="opportunity", parent_id=root.id),
        )
        child = service.add_node(
            tree.id,
            NodeCreate(
                title="Child Opp",
                node_type="child_opportunity",
                parent_id=opp.id,
            ),
        )
        assert child.node_type == "child_opportunity"

    def test_opportunity_accepts_solution(self, service: TreeService, sample_project):
        tree = service.create_tree(TreeCreate(name="Test", project_id=sample_project.id))
        root = service.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        opp = service.add_node(
            tree.id,
            NodeCreate(title="Opp", node_type="opportunity", parent_id=root.id),
        )
        sol = service.add_node(
            tree.id,
            NodeCreate(title="Sol", node_type="solution", parent_id=opp.id),
        )
        assert sol.node_type == "solution"

    def test_solution_accepts_experiment(self, service: TreeService, sample_project):
        tree = service.create_tree(TreeCreate(name="Test", project_id=sample_project.id))
        root = service.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        opp = service.add_node(
            tree.id,
            NodeCreate(title="Opp", node_type="opportunity", parent_id=root.id),
        )
        sol = service.add_node(
            tree.id,
            NodeCreate(title="Sol", node_type="solution", parent_id=opp.id),
        )
        exp = service.add_node(
            tree.id,
            NodeCreate(
                title="Exp", node_type="experiment", parent_id=sol.id
            ),
        )
        assert exp.node_type == "experiment"

    def test_experiment_accepts_children(self, service: TreeService, sample_project):
        """Type constraints removed — experiments can now have children."""
        tree = service.create_tree(TreeCreate(name="Test", project_id=sample_project.id))
        root = service.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        opp = service.add_node(
            tree.id,
            NodeCreate(title="Opp", node_type="opportunity", parent_id=root.id),
        )
        sol = service.add_node(
            tree.id,
            NodeCreate(title="Sol", node_type="solution", parent_id=opp.id),
        )
        exp = service.add_node(
            tree.id,
            NodeCreate(
                title="Exp", node_type="experiment", parent_id=sol.id
            ),
        )
        child = service.add_node(
            tree.id,
            NodeCreate(
                title="Exp2",
                node_type="experiment",
                parent_id=exp.id,
            ),
        )
        assert child.node_type == "experiment"
        assert child.parent_id == exp.id


class TestMoveSubtree:
    def test_move_to_valid_parent(self, service: TreeService, sample_tree):
        st = sample_tree
        # Move "Users don't know where to start" from opp1 to opp2
        # (child_opp → under another opportunity)
        service.move_subtree(st["child_opp1"].id, st["opp2"].id)
        moved = service.get_node(st["child_opp1"].id)
        assert moved.parent_id == st["opp2"].id

    def test_move_to_self_rejected(self, service: TreeService, sample_tree):
        st = sample_tree
        with pytest.raises(InvalidMoveError, match="Cannot move a node to itself"):
            service.move_subtree(st["opp1"].id, st["opp1"].id)

    def test_move_to_descendant_rejected(self, service: TreeService, sample_tree):
        st = sample_tree
        with pytest.raises(InvalidMoveError, match="descendants"):
            service.move_subtree(st["opp1"].id, st["child_opp1"].id)

    def test_move_any_type_under_any_parent(self, service: TreeService, sample_tree):
        """Type constraints removed — moving solution under outcome now succeeds."""
        st = sample_tree
        service.move_subtree(st["sol1"].id, st["outcome"].id)
        moved = service.get_node(st["sol1"].id)
        assert moved.parent_id == st["outcome"].id

    def test_move_root_rejected(self, service: TreeService, sample_tree):
        st = sample_tree
        # Cannot move the root node (it has no parent)
        with pytest.raises(InvalidMoveError, match="Cannot move the root"):
            service.move_subtree(st["outcome"].id, st["opp1"].id)

    def test_move_cross_tree_rejected(self, service: TreeService, sample_tree):
        st = sample_tree
        # Create a second tree in the same project
        tree2 = service.create_tree(
            TreeCreate(name="Second Tree", project_id=st["project"].id)
        )
        other_root = service.add_node(
            tree2.id,
            NodeCreate(title="Other Outcome", node_type="outcome"),
        )
        other_opp = service.add_node(
            tree2.id,
            NodeCreate(
                title="Other Opp",
                node_type="opportunity",
                parent_id=other_root.id,
            ),
        )
        # Cannot move a node from sample_tree to tree2
        with pytest.raises(InvalidMoveError, match="Cannot move a node to a different tree"):
            service.move_subtree(st["opp1"].id, other_opp.id)


class TestMergeTrees:
    def test_merge_basic(self, service: TreeService, sample_project):
        # Source tree
        src = service.create_tree(TreeCreate(name="Source", project_id=sample_project.id))
        src_root = service.add_node(
            src.id, NodeCreate(title="Source Outcome", node_type="outcome")
        )
        src_opp = service.add_node(
            src.id,
            NodeCreate(
                title="Source Opportunity",
                node_type="opportunity",
                parent_id=src_root.id,
            ),
        )

        # Target tree
        tgt = service.create_tree(TreeCreate(name="Target", project_id=sample_project.id))
        tgt_root = service.add_node(
            tgt.id, NodeCreate(title="Target Outcome", node_type="outcome")
        )

        # Merge source into target under root
        service.merge_trees(src.id, tgt.id, tgt_root.id)

        # Verify the merged tree: target root + copied source opportunity = 2 nodes
        full = service.get_full_tree(tgt.id)
        assert len(full.nodes) == 2
        titles = {n.title for n in full.nodes}
        assert "Source Opportunity" in titles

    def test_merge_empty_source(self, service: TreeService, sample_project):
        src = service.create_tree(TreeCreate(name="Empty Source", project_id=sample_project.id))
        tgt = service.create_tree(TreeCreate(name="Target", project_id=sample_project.id))
        tgt_root = service.add_node(
            tgt.id, NodeCreate(title="Root", node_type="outcome")
        )
        # Should not raise
        service.merge_trees(src.id, tgt.id, tgt_root.id)


class TestGetFullTree:
    def test_full_tree_structure(self, service: TreeService, sample_tree):
        st = sample_tree
        full = service.get_full_tree(st["tree"].id)
        assert full.name == "Test OST"
        # 1 outcome + 2 opps + 4 child_opps + 8 solutions + 1 experiment = 16
        assert len(full.nodes) == 16
        assert len(full.edges) == 2  # we set 2 edges in conftest


class TestListTreesFilter:
    def test_list_trees_by_project(self, service: TreeService):
        p1 = service.create_project(ProjectCreate(name="P1"))
        p2 = service.create_project(ProjectCreate(name="P2"))
        service.create_tree(TreeCreate(name="T1", project_id=p1.id))
        service.create_tree(TreeCreate(name="T2", project_id=p1.id))
        service.create_tree(TreeCreate(name="T3", project_id=p2.id))
        assert len(service.list_trees(project_id=p1.id)) == 2
        assert len(service.list_trees(project_id=p2.id)) == 1
        assert len(service.list_trees()) == 3


class TestTagCRUD:
    """Tests for tag creation, listing, deletion, and assignment."""

    def test_create_tag(self, service: TreeService, sample_project):
        tag = service.create_tag(sample_project.id, TagCreate(name="UX"))
        assert tag.name == "UX"
        assert tag.project_id == sample_project.id
        assert tag.color == "#6b7280"  # default color
        assert tag.id is not None

    def test_create_tag_with_color(self, service: TreeService, sample_project):
        tag = service.create_tag(sample_project.id, TagCreate(name="P0", color="#ef4444"))
        assert tag.color == "#ef4444"

    def test_list_tags(self, service: TreeService, sample_project):
        service.create_tag(sample_project.id, TagCreate(name="Alpha"))
        service.create_tag(sample_project.id, TagCreate(name="Beta"))
        tags = service.list_tags(sample_project.id)
        assert len(tags) == 2
        # Should be sorted by name
        assert tags[0].name == "Alpha"
        assert tags[1].name == "Beta"

    def test_list_tags_empty(self, service: TreeService, sample_project):
        tags = service.list_tags(sample_project.id)
        assert tags == []

    def test_list_tags_isolated_by_project(self, service: TreeService):
        p1 = service.create_project(ProjectCreate(name="P1"))
        p2 = service.create_project(ProjectCreate(name="P2"))
        service.create_tag(p1.id, TagCreate(name="Tag A"))
        service.create_tag(p2.id, TagCreate(name="Tag B"))
        assert len(service.list_tags(p1.id)) == 1
        assert len(service.list_tags(p2.id)) == 1
        assert service.list_tags(p1.id)[0].name == "Tag A"

    def test_delete_tag(self, service: TreeService, sample_project):
        tag = service.create_tag(sample_project.id, TagCreate(name="ToDelete"))
        service.delete_tag(tag.id)
        tags = service.list_tags(sample_project.id)
        assert len(tags) == 0

    def test_get_tag_by_name(self, service: TreeService, sample_project):
        service.create_tag(sample_project.id, TagCreate(name="FindMe"))
        found = service.get_tag_by_name(sample_project.id, "FindMe")
        assert found is not None
        assert found.name == "FindMe"

    def test_get_tag_by_name_not_found(self, service: TreeService, sample_project):
        result = service.get_tag_by_name(sample_project.id, "NoSuchTag")
        assert result is None

    def test_get_tag_usage_count(self, service: TreeService, sample_tree):
        st = sample_tree
        tag = service.create_tag(st["project"].id, TagCreate(name="Count"))
        assert service.get_tag_usage_count(tag.id) == 0
        service.add_tag_to_node(st["opp1"].id, tag.id)
        assert service.get_tag_usage_count(tag.id) == 1
        service.add_tag_to_node(st["opp2"].id, tag.id)
        assert service.get_tag_usage_count(tag.id) == 2

    def test_update_tag_color(self, service: TreeService, sample_project):
        tag = service.create_tag(sample_project.id, TagCreate(name="Colored"))
        updated = service.update_tag(tag.id, TagUpdate(color="#ef4444"))
        assert updated.color == "#ef4444"
        assert updated.name == "Colored"

    def test_update_tag_fill_style(self, service: TreeService, sample_project):
        tag = service.create_tag(sample_project.id, TagCreate(name="Filled"))
        updated = service.update_tag(tag.id, TagUpdate(fill_style="solid"))
        assert updated.fill_style == "solid"

    def test_update_tag_clear_fill_style(self, service: TreeService, sample_project):
        tag = service.create_tag(sample_project.id, TagCreate(name="Clear", fill_style="solid"))
        assert tag.fill_style == "solid"
        updated = service.update_tag(tag.id, TagUpdate(fill_style="none"))
        assert updated.fill_style is None

    def test_update_tag_color_and_fill(self, service: TreeService, sample_project):
        tag = service.create_tag(sample_project.id, TagCreate(name="Both"))
        updated = service.update_tag(tag.id, TagUpdate(color="#22c55e", fill_style="solid"))
        assert updated.color == "#22c55e"
        assert updated.fill_style == "solid"

    def test_create_tag_with_fill_style(self, service: TreeService, sample_project):
        tag = service.create_tag(sample_project.id, TagCreate(name="WithFill", fill_style="solid"))
        assert tag.fill_style == "solid"


class TestTagNodeAssignment:
    """Tests for adding/removing tags on nodes."""

    def test_add_tag_to_node(self, service: TreeService, sample_tree):
        st = sample_tree
        tag = service.create_tag(st["project"].id, TagCreate(name="Important"))
        service.add_tag_to_node(st["opp1"].id, tag.id)
        # Verify via get_full_tree
        full = service.get_full_tree(st["tree"].id)
        opp1 = next(n for n in full.nodes if n.id == st["opp1"].id)
        assert "Important" in opp1.tags

    def test_add_tag_to_node_idempotent(self, service: TreeService, sample_tree):
        """Adding the same tag twice should not raise or duplicate."""
        st = sample_tree
        tag = service.create_tag(st["project"].id, TagCreate(name="Once"))
        service.add_tag_to_node(st["opp1"].id, tag.id)
        service.add_tag_to_node(st["opp1"].id, tag.id)  # second add
        assert service.get_tag_usage_count(tag.id) == 1

    def test_remove_tag_from_node(self, service: TreeService, sample_tree):
        st = sample_tree
        tag = service.create_tag(st["project"].id, TagCreate(name="Removable"))
        service.add_tag_to_node(st["opp1"].id, tag.id)
        service.remove_tag_from_node(st["opp1"].id, tag.id)
        full = service.get_full_tree(st["tree"].id)
        opp1 = next(n for n in full.nodes if n.id == st["opp1"].id)
        assert "Removable" not in opp1.tags

    def test_add_tag_to_node_by_name_creates_tag(self, service: TreeService, sample_tree):
        """add_tag_to_node_by_name should create a tag if it doesn't exist."""
        st = sample_tree
        returned_tag = service.add_tag_to_node_by_name(
            st["opp1"].id, "NewTag", st["project"].id
        )
        assert returned_tag.name == "NewTag"
        # Tag should now exist in project
        assert len(service.list_tags(st["project"].id)) == 1

    def test_add_tag_to_node_by_name_reuses_existing(self, service: TreeService, sample_tree):
        """add_tag_to_node_by_name should reuse an existing tag."""
        st = sample_tree
        existing = service.create_tag(st["project"].id, TagCreate(name="Existing"))
        returned = service.add_tag_to_node_by_name(
            st["opp1"].id, "Existing", st["project"].id
        )
        assert returned.id == existing.id
        # No duplicate tags created
        assert len(service.list_tags(st["project"].id)) == 1

    def test_multiple_tags_on_one_node(self, service: TreeService, sample_tree):
        st = sample_tree
        tag_a = service.create_tag(st["project"].id, TagCreate(name="A"))
        tag_b = service.create_tag(st["project"].id, TagCreate(name="B"))
        service.add_tag_to_node(st["opp1"].id, tag_a.id)
        service.add_tag_to_node(st["opp1"].id, tag_b.id)
        full = service.get_full_tree(st["tree"].id)
        opp1 = next(n for n in full.nodes if n.id == st["opp1"].id)
        assert set(opp1.tags) == {"A", "B"}

    def test_delete_tag_cascades_from_nodes(self, service: TreeService, sample_tree):
        """Deleting a tag should remove it from all nodes (via FK cascade)."""
        st = sample_tree
        tag = service.create_tag(st["project"].id, TagCreate(name="Cascade"))
        service.add_tag_to_node(st["opp1"].id, tag.id)
        service.add_tag_to_node(st["opp2"].id, tag.id)
        service.delete_tag(tag.id)
        full = service.get_full_tree(st["tree"].id)
        for node in full.nodes:
            assert "Cascade" not in node.tags


class TestTagFiltering:
    """Tests for filtering tree by tag."""

    def test_filter_by_tag_returns_tagged_nodes_and_ancestors(
        self, service: TreeService, sample_tree
    ):
        st = sample_tree
        tag = service.create_tag(st["project"].id, TagCreate(name="Focus"))
        service.add_tag_to_node(st["sol1"].id, tag.id)

        filtered = service.get_tree_filtered_by_tag(st["tree"].id, "Focus")
        node_ids = {n.id for n in filtered.nodes}
        # Should include sol1, its parent chain: child_opp1, opp1, outcome
        assert st["sol1"].id in node_ids
        assert st["child_opp1"].id in node_ids
        assert st["opp1"].id in node_ids
        assert st["outcome"].id in node_ids
        # Should NOT include unrelated branches
        assert st["opp2"].id not in node_ids
        assert st["sol3"].id not in node_ids

    def test_filter_by_tag_no_matches(self, service: TreeService, sample_tree):
        st = sample_tree
        filtered = service.get_tree_filtered_by_tag(st["tree"].id, "Nonexistent")
        assert len(filtered.nodes) == 0
        assert len(filtered.edges) == 0

    def test_filter_by_tag_includes_edges(self, service: TreeService, sample_tree):
        st = sample_tree
        tag = service.create_tag(st["project"].id, TagCreate(name="Edge"))
        service.add_tag_to_node(st["sol1"].id, tag.id)

        filtered = service.get_tree_filtered_by_tag(st["tree"].id, "Edge")
        visible_ids = {str(n.id) for n in filtered.nodes}
        # Edges between visible nodes should be included
        for e in filtered.edges:
            assert str(e.parent_node_id) in visible_ids
            assert str(e.child_node_id) in visible_ids

    def test_filter_by_tag_multiple_tagged_nodes(
        self, service: TreeService, sample_tree
    ):
        st = sample_tree
        tag = service.create_tag(st["project"].id, TagCreate(name="Multi"))
        service.add_tag_to_node(st["sol1"].id, tag.id)
        service.add_tag_to_node(st["sol5"].id, tag.id)  # Under opp2 branch

        filtered = service.get_tree_filtered_by_tag(st["tree"].id, "Multi")
        node_ids = {n.id for n in filtered.nodes}
        # Both branches should be visible
        assert st["sol1"].id in node_ids
        assert st["sol5"].id in node_ids
        assert st["opp1"].id in node_ids
        assert st["opp2"].id in node_ids
        assert st["outcome"].id in node_ids


class TestEdgeEvidence:
    """Tests for the evidence field on edge hypotheses."""

    def test_create_edge_with_evidence(self, service: TreeService, sample_tree):
        st = sample_tree
        edge = service.set_edge_hypothesis(
            EdgeHypothesisCreate(
                parent_node_id=st["opp2"].id,
                child_node_id=st["child_opp3"].id,
                hypothesis="Users need social proof",
                hypothesis_type=HypothesisType.PROBLEM,
                evidence="5 user interviews confirmed this pain point",
            )
        )
        assert edge.evidence == "5 user interviews confirmed this pain point"

    def test_create_edge_default_empty_evidence(self, service: TreeService, sample_tree):
        st = sample_tree
        edge = service.set_edge_hypothesis(
            EdgeHypothesisCreate(
                parent_node_id=st["opp2"].id,
                child_node_id=st["child_opp4"].id,
                hypothesis="Pricing is unclear",
                hypothesis_type=HypothesisType.PROBLEM,
            )
        )
        assert edge.evidence == ""

    def test_update_edge_evidence(self, service: TreeService, sample_tree):
        st = sample_tree
        edge = service.set_edge_hypothesis(
            EdgeHypothesisCreate(
                parent_node_id=st["opp2"].id,
                child_node_id=st["child_opp3"].id,
                hypothesis="Social proof needed",
                hypothesis_type=HypothesisType.PROBLEM,
            )
        )
        updated = service.update_edge(
            edge.id,
            EdgeHypothesisUpdate(evidence="Survey data from 100 users"),
        )
        assert updated.evidence == "Survey data from 100 users"

    def test_evidence_persists_in_full_tree(self, service: TreeService, sample_tree):
        st = sample_tree
        service.set_edge_hypothesis(
            EdgeHypothesisCreate(
                parent_node_id=st["opp2"].id,
                child_node_id=st["child_opp3"].id,
                hypothesis="Need proof",
                hypothesis_type=HypothesisType.PROBLEM,
                evidence="NPS dropped 20 points",
            )
        )
        full = service.get_full_tree(st["tree"].id)
        edge_with_evidence = [
            e for e in full.edges if e.evidence == "NPS dropped 20 points"
        ]
        assert len(edge_with_evidence) == 1


class TestSnapshotWithTags:
    """Tests for snapshot/restore preserving tag data."""

    def test_snapshot_includes_tags(self, service: TreeService, sample_tree):
        st = sample_tree
        tag = service.create_tag(st["project"].id, TagCreate(name="Sprint1"))
        service.add_tag_to_node(st["opp1"].id, tag.id)

        snap = service.repo.create_snapshot(st["tree"].id, "v1 with tags")
        snapshot_detail = service.repo.get_snapshot(snap["id"])
        data = snapshot_detail["snapshot_data"]
        assert "project_tags" in data
        assert any(t["name"] == "Sprint1" for t in data["project_tags"])
        assert "node_tags" in data
        assert any(nt["node_id"] == str(st["opp1"].id) for nt in data["node_tags"])

    def test_restore_snapshot_restores_tags(self, service: TreeService, sample_tree):
        st = sample_tree
        tag = service.create_tag(st["project"].id, TagCreate(name="Restore"))
        service.add_tag_to_node(st["opp1"].id, tag.id)

        snap = service.repo.create_snapshot(st["tree"].id, "before change")

        # Remove the tag assignment
        service.remove_tag_from_node(st["opp1"].id, tag.id)
        full_before_restore = service.get_full_tree(st["tree"].id)
        opp1_before = next(n for n in full_before_restore.nodes if n.id == st["opp1"].id)
        assert "Restore" not in opp1_before.tags

        # Restore the snapshot
        service.repo.restore_snapshot(snap["id"])

        full_after_restore = service.get_full_tree(st["tree"].id)
        opp1_after = next(n for n in full_after_restore.nodes if n.id == st["opp1"].id)
        assert "Restore" in opp1_after.tags

    def test_snapshot_includes_evidence_on_edges(self, service: TreeService, sample_tree):
        st = sample_tree
        service.set_edge_hypothesis(
            EdgeHypothesisCreate(
                parent_node_id=st["opp2"].id,
                child_node_id=st["child_opp3"].id,
                hypothesis="Test snap edge",
                hypothesis_type=HypothesisType.PROBLEM,
                evidence="Interview data",
            )
        )
        snap = service.repo.create_snapshot(st["tree"].id, "with evidence")
        snapshot_detail = service.repo.get_snapshot(snap["id"])
        data = snapshot_detail["snapshot_data"]
        edges_with_evidence = [
            e for e in data["edges"] if e.get("evidence") == "Interview data"
        ]
        assert len(edges_with_evidence) == 1

    def test_restore_snapshot_restores_evidence(self, service: TreeService, sample_tree):
        st = sample_tree
        edge = service.set_edge_hypothesis(
            EdgeHypothesisCreate(
                parent_node_id=st["opp2"].id,
                child_node_id=st["child_opp3"].id,
                hypothesis="Snap evidence",
                hypothesis_type=HypothesisType.PROBLEM,
                evidence="Original evidence",
            )
        )
        snap = service.repo.create_snapshot(st["tree"].id, "before evidence change")

        # Modify the evidence
        service.update_edge(
            edge.id,
            EdgeHypothesisUpdate(evidence="Changed evidence"),
        )

        # Restore snapshot
        service.repo.restore_snapshot(snap["id"])

        full = service.get_full_tree(st["tree"].id)
        restored_edge = [
            e for e in full.edges if e.hypothesis == "Snap evidence"
        ]
        assert len(restored_edge) == 1
        assert restored_edge[0].evidence == "Original evidence"
