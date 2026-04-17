"""Validation orchestrator for OST structural rules."""

from uuid import UUID

from ost_core.db.repository import TreeRepository
from ost_core.validation.models import Severity, ValidationReport
from ost_core.validation.rules import (
    check_edge_completeness,
    check_fan_out,
    check_no_duplicate_leaves,
    check_outcome_is_measurable,
    check_problem_solution_separation,
    check_solutions_have_experiments,
    check_type_constraints,
)


class TreeValidator:
    """Runs all structural validation rules on a tree."""

    def __init__(self, repository: TreeRepository):
        self.repo = repository
        self.rules = [
            check_no_duplicate_leaves,
            check_fan_out,
            check_type_constraints,
            check_edge_completeness,
            check_problem_solution_separation,
            check_solutions_have_experiments,
            check_outcome_is_measurable,
        ]

    def validate(self, tree_id: UUID) -> ValidationReport:
        tree = self.repo.get_full_tree(tree_id)
        issues = []
        for rule in self.rules:
            issues.extend(rule(tree))

        is_valid = not any(i.severity == Severity.ERROR for i in issues)

        return ValidationReport(
            tree_id=tree_id,
            issues=issues,
            is_valid=is_valid,
        )
