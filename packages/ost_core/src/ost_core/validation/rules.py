"""Individual validation rules for OST structural integrity."""

from collections import defaultdict

from ost_core.models import TreeWithNodes
from ost_core.validation.models import Severity, ValidationIssue

# Verbs that suggest a node is a solution disguised as an opportunity
_SOLUTION_VERBS = {
    "build",
    "create",
    "add",
    "implement",
    "develop",
    "design",
    "make",
    "deploy",
    "launch",
    "integrate",
    "automate",
    "install",
    "configure",
    "set up",
    "setup",
    "write",
    "code",
    "ship",
    "migrate",
    "refactor",
}


def check_no_duplicate_leaves(tree: TreeWithNodes) -> list[ValidationIssue]:
    """No duplicate leaves — same leaf title must not appear in multiple places."""
    issues: list[ValidationIssue] = []

    # Build parent lookup
    node_map = {n.id: n for n in tree.nodes}
    children_map: dict[str, list] = defaultdict(list)
    for n in tree.nodes:
        if n.parent_id:
            children_map[str(n.parent_id)].append(n)

    # Find leaves (nodes with no children)
    leaf_nodes = [n for n in tree.nodes if str(n.id) not in children_map]

    # Group by normalized title
    title_groups: dict[str, list] = defaultdict(list)
    for leaf in leaf_nodes:
        normalized = leaf.title.strip().lower()
        title_groups[normalized].append(leaf)

    for title, nodes in title_groups.items():
        if len(nodes) > 1:
            node_ids = [str(n.id) for n in nodes]
            issues.append(
                ValidationIssue(
                    rule="no_duplicate_leaves",
                    severity=Severity.ERROR,
                    message=(
                        f"Duplicate leaf '{nodes[0].title}' appears {len(nodes)} times "
                        f"(nodes: {', '.join(node_ids[:3])})"
                    ),
                    node_id=nodes[0].id,
                    suggestion=(
                        "Restructure the tree so this leaf appears only once. "
                        "Consider creating a shared parent opportunity."
                    ),
                )
            )

    return issues


def check_fan_out(tree: TreeWithNodes) -> list[ValidationIssue]:
    """Non-leaf nodes should have at least 2 children (tree should fan out)."""
    issues: list[ValidationIssue] = []

    children_map: dict[str, list] = defaultdict(list)
    for n in tree.nodes:
        if n.parent_id:
            children_map[str(n.parent_id)].append(n)

    for node in tree.nodes:
        child_count = len(children_map.get(str(node.id), []))
        # Skip leaf nodes (no children is fine for them)
        if child_count == 0:
            continue
        # Solutions may have only 1 Experiment (testing assumptions)
        if node.node_type == "solution":
            continue
        # Single child = linear chain, should fan out
        if child_count == 1:
            issues.append(
                ValidationIssue(
                    rule="fan_out",
                    severity=Severity.WARNING,
                    message=(
                        f"'{node.title}' has only 1 child. "
                        f"Consider decomposing further — the tree should fan out."
                    ),
                    node_id=node.id,
                    suggestion=(
                        f"Add more children under '{node.title}' to explore alternatives."
                    ),
                )
            )

    return issues


def check_type_constraints(tree: TreeWithNodes) -> list[ValidationIssue]:
    """Type constraints removed — any type can be a child of any other type.
    Kept as no-op for backward compatibility with validation engine."""
    return []

    return issues


def check_edge_completeness(tree: TreeWithNodes) -> list[ValidationIssue]:
    """Every non-root node should have an assumption explaining its connection to the parent."""
    issues: list[ValidationIssue] = []

    for node in tree.nodes:
        if not node.parent_id:
            continue
        # Check new multi-assumption list first: at least one non-rejected with non-empty text
        has_active_assumption = any(
            not a.rejected and (a.text or "").strip()
            for a in getattr(node, "assumptions", [])
        )
        # Fall back to legacy single assumption field
        has_legacy_assumption = bool((node.assumption or "").strip())
        if not has_active_assumption and not has_legacy_assumption:
            parent_title = "?"
            for n in tree.nodes:
                if n.id == node.parent_id:
                    parent_title = n.title
                    break
            issues.append(
                ValidationIssue(
                    rule="edge_completeness",
                    severity=Severity.WARNING,
                    message=(
                        f"Missing assumption on '{node.title}' "
                        f"(child of '{parent_title}'). "
                        f"Every node should have an explicit assumption."
                    ),
                    node_id=node.id,
                    suggestion=(
                        f"Add an assumption to '{node.title}': "
                        f"'What must be true for this to matter for {parent_title}?'"
                    ),
                )
            )

    return issues


def check_problem_solution_separation(tree: TreeWithNodes) -> list[ValidationIssue]:
    """Opportunity nodes should describe problems, not solutions in disguise."""
    issues: list[ValidationIssue] = []

    opportunity_types = {"opportunity", "child_opportunity"}

    for node in tree.nodes:
        if node.node_type in opportunity_types:
            title_lower = node.title.strip().lower()
            for verb in _SOLUTION_VERBS:
                if title_lower.startswith(verb + " ") or title_lower.startswith(verb + "\t"):
                    issues.append(
                        ValidationIssue(
                            rule="problem_solution_separation",
                            severity=Severity.WARNING,
                            message=(
                                f"Opportunity '{node.title}' starts with '{verb}' — "
                                f"this looks like a solution, not a problem. "
                                f"Opportunities should describe user needs or pain points."
                            ),
                            node_id=node.id,
                            suggestion=(
                                "Rephrase as a problem statement. Instead of 'Build X', "
                                "try 'Users struggle with Y' or 'Users need Z'."
                            ),
                        )
                    )
                    break  # Only report once per node

    return issues


def check_solutions_have_experiments(tree: TreeWithNodes) -> list[ValidationIssue]:
    """Solutions should have at least one Experiment child to validate assumptions."""
    issues: list[ValidationIssue] = []

    children_map: dict[str, list] = defaultdict(list)
    for n in tree.nodes:
        if n.parent_id:
            children_map[str(n.parent_id)].append(n)

    for node in tree.nodes:
        if node.node_type == "solution":
            children = children_map.get(str(node.id), [])
            has_experiment = any(
                c.node_type == "experiment" for c in children
            )
            if not has_experiment:
                issues.append(
                    ValidationIssue(
                        rule="solution_needs_experiment",
                        severity=Severity.WARNING,
                        message=(
                            f"Solution '{node.title}' has no Experiments. "
                            f"Every solution should have at least one test "
                            f"to validate its assumptions."
                        ),
                        node_id=node.id,
                        suggestion=(
                            f"'{node.title}' has no experiments. Add one to test "
                            f"the key assumptions about this solution."
                        ),
                    )
                )

    return issues


def check_outcome_is_measurable(tree: TreeWithNodes) -> list[ValidationIssue]:
    """Outcome nodes should contain measurable language (numbers, percentages, KPIs)."""
    issues: list[ValidationIssue] = []

    import re
    _HAS_NUMBER = re.compile(r"\d")
    _KPI_ACRONYMS = re.compile(
        r"\b(nps|dau|mau|wau|arpu|ltv|csat|arr|mrr|cac|gmv)\b",
        re.IGNORECASE,
    )

    for node in tree.nodes:
        if node.node_type == "outcome":
            text = f"{node.title} {node.description or ''}"
            has_number = bool(_HAS_NUMBER.search(text))
            has_kpi = bool(_KPI_ACRONYMS.search(text))
            if not has_number and not has_kpi:
                issues.append(
                    ValidationIssue(
                        rule="outcome_measurability",
                        severity=Severity.WARNING,
                        message=(
                            f"Outcome '{node.title}' doesn't include a numeric target "
                            f"or recognized metric. A good Outcome should state a "
                            f"metric and target value (e.g., 'Increase DAU to 1M')."
                        ),
                        node_id=node.id,
                        suggestion=(
                            f"Consider adding a metric to '{node.title}' "
                            f"(e.g., 'Increase X by Y%')."
                        ),
                    )
                )

    return issues
