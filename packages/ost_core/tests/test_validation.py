"""Tests for validation rules."""

import pytest

from ost_core.models import (
    EdgeHypothesisCreate,
    HypothesisType,
    NodeCreate,
    ProjectCreate,
    TreeCreate,
)
from ost_core.services.tree_service import TreeService
from ost_core.validation.models import Severity
from ost_core.validation.validator import TreeValidator


class TestNoDuplicateLeaves:
    def test_no_duplicates_passes(self, validator: TreeValidator, sample_tree):
        """Sample tree has no duplicate leaves — should produce no errors for this rule."""
        report = validator.validate(sample_tree["tree"].id)
        dup_issues = [i for i in report.issues if i.rule == "no_duplicate_leaves"]
        assert len(dup_issues) == 0

    def test_duplicate_leaves_detected(self, service: TreeService, validator: TreeValidator, sample_project):
        tree = service.create_tree(TreeCreate(name="Test", project_id=sample_project.id))
        root = service.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        opp1 = service.add_node(
            tree.id,
            NodeCreate(title="Opp 1", node_type="opportunity", parent_id=root.id),
        )
        opp2 = service.add_node(
            tree.id,
            NodeCreate(title="Opp 2", node_type="opportunity", parent_id=root.id),
        )
        # Add same solution leaf under two different parents
        service.add_node(
            tree.id,
            NodeCreate(title="Same Solution", node_type="solution", parent_id=opp1.id),
        )
        service.add_node(
            tree.id,
            NodeCreate(title="Same Solution", node_type="solution", parent_id=opp2.id),
        )

        report = validator.validate(tree.id)
        dup_issues = [i for i in report.issues if i.rule == "no_duplicate_leaves"]
        assert len(dup_issues) == 1
        assert dup_issues[0].severity == Severity.ERROR


class TestFanOut:
    def test_well_formed_tree_no_fan_out_warnings(
        self, validator: TreeValidator, sample_tree
    ):
        """Most of sample tree fans out properly."""
        report = validator.validate(sample_tree["tree"].id)
        fan_issues = [i for i in report.issues if i.rule == "fan_out"]
        # sol1 has exactly 1 child (exp1) but Solutions are exempt from fan-out
        assert len(fan_issues) == 0

    def test_single_child_warned(self, service: TreeService, validator: TreeValidator, sample_project):
        tree = service.create_tree(TreeCreate(name="Test", project_id=sample_project.id))
        root = service.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        opp = service.add_node(
            tree.id,
            NodeCreate(title="Opp", node_type="opportunity", parent_id=root.id),
        )
        # Root has exactly 1 child → warning
        report = validator.validate(tree.id)
        fan_issues = [i for i in report.issues if i.rule == "fan_out"]
        assert len(fan_issues) == 1
        assert fan_issues[0].node_id == root.id
        # Suggestion should mention the node name
        assert "Root" in fan_issues[0].suggestion


class TestTypeConstraints:
    def test_valid_tree_no_type_errors(self, validator: TreeValidator, sample_tree):
        report = validator.validate(sample_tree["tree"].id)
        type_issues = [i for i in report.issues if i.rule == "type_constraints"]
        assert len(type_issues) == 0


class TestEdgeCompleteness:
    def test_missing_assumptions_warned(self, validator: TreeValidator, sample_tree):
        """Sample tree has 15 non-root nodes, all without assumptions → 15 warnings."""
        report = validator.validate(sample_tree["tree"].id)
        edge_issues = [i for i in report.issues if i.rule == "edge_completeness"]
        assert len(edge_issues) == 15

    def test_node_with_assumption_no_warning(
        self, service: TreeService, validator: TreeValidator, sample_project
    ):
        tree = service.create_tree(TreeCreate(name="Test", project_id=sample_project.id))
        root = service.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        child = service.add_node(
            tree.id,
            NodeCreate(
                title="Child",
                node_type="opportunity",
                parent_id=root.id,
                assumption="This drives the outcome",
            ),
        )

        report = validator.validate(tree.id)
        edge_issues = [i for i in report.issues if i.rule == "edge_completeness"]
        assert len(edge_issues) == 0


class TestProblemSolutionSeparation:
    def test_solution_disguised_as_opportunity(
        self, service: TreeService, validator: TreeValidator, sample_project
    ):
        tree = service.create_tree(TreeCreate(name="Test", project_id=sample_project.id))
        root = service.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        # This is a solution disguised as an opportunity
        service.add_node(
            tree.id,
            NodeCreate(
                title="Build a better search engine",
                node_type="opportunity",
                parent_id=root.id,
            ),
        )
        service.add_node(
            tree.id,
            NodeCreate(
                title="Users can't find what they need",
                node_type="opportunity",
                parent_id=root.id,
            ),
        )

        report = validator.validate(tree.id)
        sep_issues = [i for i in report.issues if i.rule == "problem_solution_separation"]
        assert len(sep_issues) == 1
        assert "Build" in sep_issues[0].message

    def test_proper_opportunities_pass(self, validator: TreeValidator, sample_tree):
        report = validator.validate(sample_tree["tree"].id)
        sep_issues = [i for i in report.issues if i.rule == "problem_solution_separation"]
        assert len(sep_issues) == 0


class TestValidationReport:
    def test_valid_tree_is_valid(self, service: TreeService, validator: TreeValidator, sample_project):
        """A minimal well-formed tree should be valid (no ERRORs)."""
        tree = service.create_tree(TreeCreate(name="Test", project_id=sample_project.id))
        root = service.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        opp1 = service.add_node(
            tree.id,
            NodeCreate(title="Opp 1", node_type="opportunity", parent_id=root.id),
        )
        opp2 = service.add_node(
            tree.id,
            NodeCreate(title="Opp 2", node_type="opportunity", parent_id=root.id),
        )

        report = validator.validate(tree.id)
        # No errors (only warnings for missing edges and possible fan-out)
        assert report.is_valid is True

    def test_invalid_tree_has_errors(
        self, service: TreeService, validator: TreeValidator, sample_project
    ):
        """A tree with duplicate leaves should be invalid."""
        tree = service.create_tree(TreeCreate(name="Test", project_id=sample_project.id))
        root = service.add_node(
            tree.id, NodeCreate(title="Root", node_type="outcome")
        )
        opp1 = service.add_node(
            tree.id,
            NodeCreate(title="Opp 1", node_type="opportunity", parent_id=root.id),
        )
        opp2 = service.add_node(
            tree.id,
            NodeCreate(title="Opp 2", node_type="opportunity", parent_id=root.id),
        )
        service.add_node(
            tree.id,
            NodeCreate(
                title="Duplicate", node_type="solution", parent_id=opp1.id
            ),
        )
        service.add_node(
            tree.id,
            NodeCreate(
                title="Duplicate", node_type="solution", parent_id=opp2.id
            ),
        )

        report = validator.validate(tree.id)
        assert report.is_valid is False
