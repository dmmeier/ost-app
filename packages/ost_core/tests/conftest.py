"""Shared test fixtures for ost_core tests."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

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
from ost_core.validation.validator import TreeValidator


@pytest.fixture
def engine():
    """In-memory SQLite engine for testing."""
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    return eng


@pytest.fixture
def session_factory(engine):
    return sessionmaker(bind=engine)


@pytest.fixture
def repo(session_factory):
    return TreeRepository(session_factory)


@pytest.fixture
def service(repo):
    return TreeService(repo)


@pytest.fixture
def validator(repo):
    return TreeValidator(repo)


@pytest.fixture
def sample_project(service):
    """Create a sample project for testing."""
    return service.create_project(ProjectCreate(name="Test Project", description="A test project"))


@pytest.fixture
def sample_tree(service, sample_project):
    """Create a well-formed sample tree for testing.

    Structure:
        Outcome: "Increase DAU to 1M"
        ├── Opportunity: "Users struggle to complete tasks"
        │   ├── Child Opportunity: "Users don't know where to start"
        │   │   ├── Solution: "Add onboarding wizard"
        │   │   │   └── Experiment: "A/B test wizard vs no wizard"
        │   │   └── Solution: "Add contextual help tooltips"
        │   └── Child Opportunity: "Users lose progress midway"
        │       ├── Solution: "Auto-save feature"
        │       └── Solution: "Progress indicator"
        └── Opportunity: "Users don't trust the platform"
            ├── Child Opportunity: "No social proof"
            │   ├── Solution: "Add testimonials"
            │   └── Solution: "Show usage statistics"
            └── Child Opportunity: "Unclear pricing"
                ├── Solution: "Transparent pricing page"
                └── Solution: "Free trial"
    """
    tree = service.create_tree(
        TreeCreate(name="Test OST", description="A test tree", project_id=sample_project.id)
    )

    # Root
    outcome = service.add_node(
        tree.id,
        NodeCreate(title="Increase DAU to 1M", node_type="outcome"),
    )

    # L1 Opportunities
    opp1 = service.add_node(
        tree.id,
        NodeCreate(
            title="Users struggle to complete tasks",
            node_type="opportunity",
            parent_id=outcome.id,
        ),
    )
    opp2 = service.add_node(
        tree.id,
        NodeCreate(
            title="Users don't trust the platform",
            node_type="opportunity",
            parent_id=outcome.id,
        ),
    )

    # L2 Child Opportunities
    child_opp1 = service.add_node(
        tree.id,
        NodeCreate(
            title="Users don't know where to start",
            node_type="child_opportunity",
            parent_id=opp1.id,
        ),
    )
    child_opp2 = service.add_node(
        tree.id,
        NodeCreate(
            title="Users lose progress midway",
            node_type="child_opportunity",
            parent_id=opp1.id,
        ),
    )
    child_opp3 = service.add_node(
        tree.id,
        NodeCreate(
            title="No social proof",
            node_type="child_opportunity",
            parent_id=opp2.id,
        ),
    )
    child_opp4 = service.add_node(
        tree.id,
        NodeCreate(
            title="Unclear pricing",
            node_type="child_opportunity",
            parent_id=opp2.id,
        ),
    )

    # L3 Solutions
    sol1 = service.add_node(
        tree.id,
        NodeCreate(
            title="Add onboarding wizard",
            node_type="solution",
            parent_id=child_opp1.id,
        ),
    )
    sol2 = service.add_node(
        tree.id,
        NodeCreate(
            title="Add contextual help tooltips",
            node_type="solution",
            parent_id=child_opp1.id,
        ),
    )
    sol3 = service.add_node(
        tree.id,
        NodeCreate(
            title="Auto-save feature",
            node_type="solution",
            parent_id=child_opp2.id,
        ),
    )
    sol4 = service.add_node(
        tree.id,
        NodeCreate(
            title="Progress indicator",
            node_type="solution",
            parent_id=child_opp2.id,
        ),
    )
    sol5 = service.add_node(
        tree.id,
        NodeCreate(
            title="Add testimonials",
            node_type="solution",
            parent_id=child_opp3.id,
        ),
    )
    sol6 = service.add_node(
        tree.id,
        NodeCreate(
            title="Show usage statistics",
            node_type="solution",
            parent_id=child_opp3.id,
        ),
    )
    sol7 = service.add_node(
        tree.id,
        NodeCreate(
            title="Transparent pricing page",
            node_type="solution",
            parent_id=child_opp4.id,
        ),
    )
    sol8 = service.add_node(
        tree.id,
        NodeCreate(
            title="Free trial",
            node_type="solution",
            parent_id=child_opp4.id,
        ),
    )

    # L4 Experiment
    exp1 = service.add_node(
        tree.id,
        NodeCreate(
            title="A/B test wizard vs no wizard",
            node_type="experiment",
            parent_id=sol1.id,
        ),
    )

    # Add some edge hypotheses
    service.set_edge_hypothesis(
        EdgeHypothesisCreate(
            parent_node_id=outcome.id,
            child_node_id=opp1.id,
            hypothesis="Task completion is the primary driver of daily engagement",
            hypothesis_type=HypothesisType.PROBLEM,
        )
    )
    service.set_edge_hypothesis(
        EdgeHypothesisCreate(
            parent_node_id=child_opp1.id,
            child_node_id=sol1.id,
            hypothesis="A guided wizard will reduce first-session drop-off by 30%",
            hypothesis_type=HypothesisType.SOLUTION,
            is_risky=True,
        )
    )

    return {
        "tree": tree,
        "project": sample_project,
        "outcome": outcome,
        "opp1": opp1,
        "opp2": opp2,
        "child_opp1": child_opp1,
        "child_opp2": child_opp2,
        "child_opp3": child_opp3,
        "child_opp4": child_opp4,
        "sol1": sol1,
        "sol2": sol2,
        "sol3": sol3,
        "sol4": sol4,
        "sol5": sol5,
        "sol6": sol6,
        "sol7": sol7,
        "sol8": sol8,
        "exp1": exp1,
    }
