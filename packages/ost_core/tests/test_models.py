"""Tests for Pydantic models."""

import pytest
from pydantic import ValidationError

from ost_core.models import (
    VALID_CHILD_TYPES,
    EdgeHypothesisCreate,
    HypothesisSpace,
    HypothesisType,
    Node,
    NodeCreate,
    STANDARD_NODE_TYPES,
    TreeCreate,
)
from ost_core.models.node import NODE_TYPE_TO_SPACE


class TestNodeType:
    def test_all_types_have_hypothesis_space(self):
        for nt in STANDARD_NODE_TYPES:
            assert nt in NODE_TYPE_TO_SPACE

    def test_problem_space_types(self):
        assert NODE_TYPE_TO_SPACE["outcome"] == HypothesisSpace.PROBLEM
        assert NODE_TYPE_TO_SPACE["opportunity"] == HypothesisSpace.PROBLEM
        assert NODE_TYPE_TO_SPACE["child_opportunity"] == HypothesisSpace.PROBLEM

    def test_solution_space_types(self):
        assert NODE_TYPE_TO_SPACE["solution"] == HypothesisSpace.SOLUTION
        assert NODE_TYPE_TO_SPACE["experiment"] == HypothesisSpace.SOLUTION

    def test_valid_child_types_completeness(self):
        for nt in STANDARD_NODE_TYPES:
            assert nt in VALID_CHILD_TYPES

    def test_experiment_has_no_children(self):
        assert VALID_CHILD_TYPES["experiment"] == []

    def test_outcome_only_allows_opportunity(self):
        assert VALID_CHILD_TYPES["outcome"] == ["opportunity"]


class TestNodeCreate:
    def test_valid_create(self):
        nc = NodeCreate(title="Test", node_type="outcome")
        assert nc.title == "Test"
        assert nc.parent_id is None

    def test_empty_title_rejected(self):
        with pytest.raises(ValidationError):
            NodeCreate(title="", node_type="outcome")

    def test_long_title_rejected(self):
        with pytest.raises(ValidationError):
            NodeCreate(title="x" * 501, node_type="outcome")

    def test_description_defaults_to_empty(self):
        nc = NodeCreate(title="Test", node_type="outcome")
        assert nc.description == ""


class TestNode:
    def test_hypothesis_space_property(self):
        from uuid import uuid4

        node = Node(
            tree_id=uuid4(),
            node_type="opportunity",
            title="Test",
        )
        assert node.hypothesis_space == HypothesisSpace.PROBLEM

    def test_is_leaf_type(self):
        from uuid import uuid4

        experiment = Node(tree_id=uuid4(), node_type="experiment", title="Test")
        assert experiment.is_leaf_type is True

        solution = Node(tree_id=uuid4(), node_type="solution", title="Test")
        assert solution.is_leaf_type is False


class TestTreeCreate:
    def test_valid_create(self):
        from uuid import uuid4

        tc = TreeCreate(name="My Tree", project_id=uuid4())
        assert tc.name == "My Tree"
        assert tc.description == ""

    def test_empty_name_rejected(self):
        from uuid import uuid4

        with pytest.raises(ValidationError):
            TreeCreate(name="", project_id=uuid4())

    def test_long_name_rejected(self):
        from uuid import uuid4

        with pytest.raises(ValidationError):
            TreeCreate(name="x" * 201, project_id=uuid4())

    def test_project_id_required(self):
        with pytest.raises(ValidationError):
            TreeCreate(name="My Tree")


class TestEdgeHypothesisCreate:
    def test_valid_create(self):
        from uuid import uuid4

        ec = EdgeHypothesisCreate(
            parent_node_id=uuid4(),
            child_node_id=uuid4(),
            hypothesis="Users will click this button",
            hypothesis_type=HypothesisType.DESIRABILITY,
        )
        assert ec.is_risky is False

    def test_empty_hypothesis_rejected(self):
        from uuid import uuid4

        with pytest.raises(ValidationError):
            EdgeHypothesisCreate(
                parent_node_id=uuid4(),
                child_node_id=uuid4(),
                hypothesis="",
                hypothesis_type=HypothesisType.PROBLEM,
            )
