"""Typer CLI for Opportunity Solution Trees."""

import json
from typing import Optional
from uuid import UUID

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.tree import Tree as RichTree

from ost_core.dependencies import get_tree_service_fresh, get_validator
from ost_core.models import (
    EdgeHypothesisCreate,
    EdgeHypothesisUpdate,
    HypothesisType,
    NodeAssumptionCreate,
    NodeAssumptionUpdate,
    NodeCreate,
    NodeUpdate,
    ProjectCreate,
    ProjectUpdate,
    TagCreate,
    TagUpdate,
    TreeCreate,
    TreeUpdate,
)

app = typer.Typer(name="ost", help="Opportunity Solution Tree CLI")
project_app = typer.Typer(name="project", help="Manage projects")
app.add_typer(project_app, name="project")
edge_app = typer.Typer(name="edge", help="Manage edge hypotheses (assumptions)")
app.add_typer(edge_app, name="edge")
tag_app = typer.Typer(name="tag", help="Manage tags")
app.add_typer(tag_app, name="tag")
git_app = typer.Typer(name="git", help="Git export commands")
app.add_typer(git_app, name="git")
auth_app = typer.Typer(name="auth", help="Authentication commands")
app.add_typer(auth_app, name="auth")
assumption_app = typer.Typer(name="assumption", help="Manage node assumptions")
app.add_typer(assumption_app, name="assumption")


console = Console()

# Color mapping for node types
NODE_COLORS = {
    "outcome": "bold blue",
    "opportunity": "bold yellow",
    "child_opportunity": "bold cyan",
    "solution": "bold green",
    "experiment": "bold magenta",
}

NODE_ICONS = {
    "outcome": "🎯",
    "opportunity": "🔍",
    "child_opportunity": "🔎",
    "solution": "💡",
    "experiment": "🧪",
}


def _get_service():
    return get_tree_service_fresh()


def _get_validator():
    return get_validator()


def _resolve_tree_id(prefix: str) -> UUID:
    """Resolve a partial UUID prefix to a full tree ID."""
    if len(prefix) >= 32:
        return UUID(prefix)
    service = _get_service()
    trees = service.list_trees()
    matches = [t for t in trees if str(t.id).startswith(prefix)]
    if len(matches) == 1:
        return matches[0].id
    if len(matches) == 0:
        console.print(f"[red]No tree found matching prefix '{prefix}'[/red]")
        raise typer.Exit(1)
    console.print(f"[red]Ambiguous prefix '{prefix}' — matches {len(matches)} trees:[/red]")
    for m in matches:
        console.print(f"  {m.id}  {m.name}")
    raise typer.Exit(1)


def _resolve_project_id(prefix: str) -> UUID:
    """Resolve a partial UUID prefix to a full project ID."""
    if len(prefix) >= 32:
        return UUID(prefix)
    service = _get_service()
    projects = service.list_projects()
    matches = [p for p in projects if str(p.id).startswith(prefix)]
    if len(matches) == 1:
        return matches[0].id
    if len(matches) == 0:
        console.print(f"[red]No project found matching prefix '{prefix}'[/red]")
        raise typer.Exit(1)
    console.print(f"[red]Ambiguous prefix '{prefix}' — matches {len(matches)} projects:[/red]")
    for m in matches:
        console.print(f"  {m.id}  {m.name}")
    raise typer.Exit(1)


# ── Project commands ─────────────────────────────────────────


@project_app.command("create")
def project_create(
    name: str = typer.Argument(..., help="Name of the project"),
    description: str = typer.Option("", help="Description of the project"),
):
    """Create a new project."""
    service = _get_service()
    project = service.create_project(ProjectCreate(name=name, description=description))
    console.print(f"[green]Created project:[/green] {project.name} ({project.id})")


@project_app.command("list")
def project_list():
    """List all projects."""
    service = _get_service()
    projects = service.list_projects()
    if not projects:
        console.print("[dim]No projects found.[/dim]")
        return

    table = Table(title="Projects")
    table.add_column("ID", style="dim")
    table.add_column("Name", style="bold")
    table.add_column("Description")
    table.add_column("Created", style="dim")

    for p in projects:
        table.add_row(
            str(p.id)[:8] + "...",
            p.name,
            p.description or "-",
            str(p.created_at)[:19],
        )

    console.print(table)


@project_app.command("show")
def project_show(project_id: str = typer.Argument(..., help="Project ID (or prefix)")):
    """Show a project and its trees."""
    service = _get_service()
    project = service.get_project_with_trees(_resolve_project_id(project_id))
    console.print(Panel(f"[bold]{project.name}[/bold]\n{project.description or ''}", border_style="blue"))

    if not project.trees:
        console.print("[dim]No trees in this project.[/dim]")
        return

    table = Table(title="Trees")
    table.add_column("ID", style="dim")
    table.add_column("Name", style="bold")
    table.add_column("Description")

    for t in project.trees:
        table.add_row(str(t.id)[:8] + "...", t.name, t.description or "-")

    console.print(table)


@project_app.command("delete")
def project_delete(project_id: str = typer.Argument(..., help="Project ID (or prefix)")):
    """Delete a project and all its trees."""
    service = _get_service()
    service.delete_project(_resolve_project_id(project_id))
    console.print(f"[red]Deleted project:[/red] {project_id}")


@project_app.command("update")
def project_update(
    project_id: str = typer.Argument(..., help="Project ID (or prefix)"),
    name: Optional[str] = typer.Option(None, help="New name"),
    description: Optional[str] = typer.Option(None, help="New description"),
    context: Optional[str] = typer.Option(None, help="New project context"),
):
    """Update a project's name, description, or context."""
    service = _get_service()
    project = service.update_project(
        _resolve_project_id(project_id),
        ProjectUpdate(name=name, description=description, project_context=context),
    )
    console.print(f"[green]Updated project:[/green] {project.name} ({project.id})")


@project_app.command("members")
def project_members(
    project_id: str = typer.Argument(..., help="Project ID (or prefix)"),
):
    """List all members and their roles for a project."""
    service = _get_service()
    pid = _resolve_project_id(project_id)
    members = service.list_members(str(pid))
    if not members:
        console.print("[dim]No members found (open mode or single-user).[/dim]")
        return

    table = Table(title="Project Members")
    table.add_column("User ID", style="dim")
    table.add_column("Name", style="bold")
    table.add_column("Email")
    table.add_column("Role")
    table.add_column("Added", style="dim")

    role_colors = {"owner": "red", "editor": "green", "viewer": "blue"}

    for m in members:
        color = role_colors.get(m.role, "")
        table.add_row(
            str(m.user_id)[:8] + "...",
            m.display_name,
            m.email,
            f"[{color}]{m.role}[/{color}]",
            str(m.created_at)[:19],
        )

    console.print(table)


@project_app.command("add-member")
def project_add_member(
    project_id: str = typer.Argument(..., help="Project ID (or prefix)"),
    email: str = typer.Option(..., "--email", help="Email of user to add"),
    role: str = typer.Option("editor", "--role", help="Role: owner, editor, viewer"),
):
    """Add a member to a project."""
    from ost_core.exceptions import PermissionDeniedError, UserNotFoundError

    service = _get_service()
    pid = _resolve_project_id(project_id)

    # Use saved token to get current user
    from ost_core.auth import decode_token
    token = _load_token()
    user_id = None
    if token:
        try:
            payload = decode_token(token)
            user_id = payload.get("sub")
        except Exception:
            pass

    try:
        member = service.add_member(user_id, str(pid), email, role)
        console.print(f"[green]Added member:[/green] {member.display_name} ({member.email}) as {role}")
    except PermissionDeniedError as e:
        console.print(f"[red]Permission denied:[/red] {e}")
        raise typer.Exit(1)
    except UserNotFoundError:
        console.print(f"[red]User not found:[/red] {email}")
        raise typer.Exit(1)


@project_app.command("remove-member")
def project_remove_member(
    project_id: str = typer.Argument(..., help="Project ID (or prefix)"),
    email: str = typer.Option(..., "--email", help="Email of user to remove"),
):
    """Remove a member from a project."""
    from ost_core.exceptions import PermissionDeniedError, UserNotFoundError

    service = _get_service()
    pid = _resolve_project_id(project_id)

    # Resolve target user by email
    result = service.repo.get_user_by_email(email)
    if not result:
        console.print(f"[red]User not found:[/red] {email}")
        raise typer.Exit(1)
    target_user, _ = result

    # Use saved token to get current user
    from ost_core.auth import decode_token
    token = _load_token()
    user_id = None
    if token:
        try:
            payload = decode_token(token)
            user_id = payload.get("sub")
        except Exception:
            pass

    try:
        service.remove_member(user_id, str(pid), str(target_user.id))
        console.print(f"[red]Removed member:[/red] {email}")
    except PermissionDeniedError as e:
        console.print(f"[red]Permission denied:[/red] {e}")
        raise typer.Exit(1)


@project_app.command("set-role")
def project_set_role(
    project_id: str = typer.Argument(..., help="Project ID (or prefix)"),
    email: str = typer.Option(..., "--email", help="Email of user to update"),
    role: str = typer.Option(..., "--role", help="New role: owner, editor, viewer"),
):
    """Change a member's role in a project."""
    from ost_core.exceptions import PermissionDeniedError, UserNotFoundError

    service = _get_service()
    pid = _resolve_project_id(project_id)

    # Resolve target user by email
    result = service.repo.get_user_by_email(email)
    if not result:
        console.print(f"[red]User not found:[/red] {email}")
        raise typer.Exit(1)
    target_user, _ = result

    # Use saved token to get current user
    from ost_core.auth import decode_token
    token = _load_token()
    user_id = None
    if token:
        try:
            payload = decode_token(token)
            user_id = payload.get("sub")
        except Exception:
            pass

    try:
        service.update_member_role(user_id, str(pid), str(target_user.id), role)
        console.print(f"[green]Updated role:[/green] {email} → {role}")
    except PermissionDeniedError as e:
        console.print(f"[red]Permission denied:[/red] {e}")
        raise typer.Exit(1)


# ── Tree commands ────────────────────────────────────────────


@app.command()
def create(
    name: str = typer.Argument(..., help="Name of the OST"),
    project_id: str = typer.Option(..., help="Project ID to create the tree in"),
    description: str = typer.Option("", help="Description of the tree"),
    context: str = typer.Option("", "--context", help="Initial tree context"),
):
    """Create a new Opportunity Solution Tree within a project."""
    service = _get_service()
    tree_data = TreeCreate(
        name=name, description=description,
        tree_context=context, project_id=UUID(project_id),
    )
    tree = service.create_tree(tree_data, user_id=_get_current_user_id())
    console.print(f"[green]Created tree:[/green] {tree.name} ({tree.id})")


@app.command("list")
def list_trees(
    project_id: Optional[str] = typer.Option(None, help="Filter by project ID"),
):
    """List all Opportunity Solution Trees."""
    service = _get_service()
    pid = UUID(project_id) if project_id else None
    trees = service.list_trees(project_id=pid)
    if not trees:
        console.print("[dim]No trees found.[/dim]")
        return

    table = Table(title="Opportunity Solution Trees")
    table.add_column("ID", style="dim")
    table.add_column("Name", style="bold")
    table.add_column("Project", style="dim")
    table.add_column("Description")
    table.add_column("Created", style="dim")

    for t in trees:
        table.add_row(
            str(t.id)[:8] + "...",
            t.name,
            str(t.project_id)[:8] + "...",
            t.description or "-",
            str(t.created_at)[:19],
        )

    console.print(table)


@app.command()
def show(
    tree_id: str = typer.Argument(..., help="Tree ID (or prefix)"),
    tag: Optional[str] = typer.Option(None, "--tag", help="Filter by tag name"),
):
    """Display a tree structure with Rich formatting."""
    service = _get_service()
    tid = _resolve_tree_id(tree_id)
    if tag:
        full_tree = service.get_tree_filtered_by_tag(tid, tag)
    else:
        full_tree = service.get_full_tree(tid)

    # Build node lookup
    children_map: dict[str, list] = {}
    roots: list = []

    for n in full_tree.nodes:
        if n.parent_id is None:
            roots.append(n)
        else:
            parent_key = str(n.parent_id)
            if parent_key not in children_map:
                children_map[parent_key] = []
            children_map[parent_key].append(n)

    if not roots:
        console.print("[dim]Tree is empty.[/dim]")
        return

    # Sort roots by sort_order
    roots.sort(key=lambda r: (r.sort_order or 0, str(r.created_at)))

    def _add_children(parent_id: str, parent_tree: RichTree):
        for child in children_map.get(parent_id, []):
            icon = NODE_ICONS.get(child.node_type, "")
            color = NODE_COLORS.get(child.node_type, "")
            # Show node assumption annotation
            assumption_text = ""
            if child.assumption:
                assumption_text = f" ← [dim italic]'{child.assumption}'[/dim italic]"
            child_tree = parent_tree.add(
                f"[{color}]{icon} {child.title}[/{color}] [dim]({child.node_type})[/dim]{assumption_text}"
            )
            _add_children(str(child.id), child_tree)

    # Display each root as a separate tree panel
    for root in roots:
        icon = NODE_ICONS.get(root.node_type, "")
        color = NODE_COLORS.get(root.node_type, "")
        rich_tree = RichTree(f"[{color}]{icon} {root.title}[/{color}] [dim]({root.node_type})[/dim]")
        _add_children(str(root.id), rich_tree)
        console.print(Panel(rich_tree, title=f"[bold]{full_tree.name}[/bold]", border_style="blue"))


@app.command()
def add(
    tree_id: str = typer.Argument(..., help="Tree ID (or prefix)"),
    title: str = typer.Argument(..., help="Node title"),
    node_type: str = typer.Argument(
        ..., help="Node type: outcome, opportunity, child_opportunity, solution, experiment (or custom slug)"
    ),
    parent_id: Optional[str] = typer.Option(None, help="Parent node ID"),
    description: str = typer.Option("", help="Node description"),
    assumption: Optional[str] = typer.Option(None, help="Assumption explaining why this node matters for its parent"),
    evidence: Optional[str] = typer.Option(None, help="Supporting data, research, or observations"),
):
    """Add a node to a tree."""
    service = _get_service()
    node = service.add_node(
        _resolve_tree_id(tree_id),
        NodeCreate(
            title=title,
            node_type=node_type,
            parent_id=UUID(parent_id) if parent_id else None,
            description=description,
            assumption=assumption,
            evidence=evidence,
        ),
        user_id=_get_current_user_id(),
    )
    color = NODE_COLORS.get(node.node_type, "")
    console.print(f"[green]Added:[/green] [{color}]{node.title}[/{color}] ({node.id})")


@app.command()
def remove(
    node_id: str = typer.Argument(..., help="Node ID to remove"),
    cascade: bool = typer.Option(True, help="Remove subtree too"),
):
    """Remove a node (and optionally its subtree)."""
    service = _get_service()
    service.remove_node(UUID(node_id), cascade=cascade, user_id=_get_current_user_id())
    console.print(f"[red]Removed:[/red] {node_id}")


@app.command()
def move(
    node_id: str = typer.Argument(..., help="Node ID to move"),
    new_parent_id: str = typer.Argument(..., help="New parent node ID"),
):
    """Move a node and its subtree to a new parent."""
    service = _get_service()
    service.move_subtree(UUID(node_id), UUID(new_parent_id), user_id=_get_current_user_id())
    console.print(f"[green]Moved:[/green] {node_id} → {new_parent_id}")


@app.command()
def validate(tree_id: str = typer.Argument(..., help="Tree ID (or prefix)")):
    """Validate a tree and show structural issues."""
    validator = _get_validator()
    report = validator.validate(_resolve_tree_id(tree_id))

    if not report.issues:
        console.print("[green]✓ Tree is valid! No issues found.[/green]")
        return

    table = Table(title="Validation Results")
    table.add_column("Severity", style="bold")
    table.add_column("Rule")
    table.add_column("Message")
    table.add_column("Suggestion", style="dim")

    severity_colors = {"error": "red", "warning": "yellow", "info": "blue"}

    for issue in report.issues:
        color = severity_colors.get(issue.severity.value, "")
        table.add_row(
            f"[{color}]{issue.severity.value.upper()}[/{color}]",
            issue.rule,
            issue.message,
            issue.suggestion,
        )

    console.print(table)

    if report.is_valid:
        console.print("[green]✓ Tree is valid (warnings only).[/green]")
    else:
        console.print("[red]✗ Tree has errors that need to be fixed.[/red]")


@app.command()
def stats(tree_id: str = typer.Argument(..., help="Tree ID (or prefix)")):
    """Show tree statistics: node counts by type, edge counts, depth."""
    service = _get_service()
    full_tree = service.get_full_tree(_resolve_tree_id(tree_id))

    # Count nodes by type
    type_counts: dict[str, int] = {}
    for n in full_tree.nodes:
        type_counts[n.node_type] = type_counts.get(n.node_type, 0) + 1

    # Count edges by hypothesis type and risky status
    hyp_type_counts: dict[str, int] = {}
    risky_count = 0
    for e in full_tree.edges:
        ht = e.hypothesis_type.value if hasattr(e.hypothesis_type, "value") else str(e.hypothesis_type)
        hyp_type_counts[ht] = hyp_type_counts.get(ht, 0) + 1
        if e.is_risky:
            risky_count += 1

    # Calculate tree depth (max across all root subtrees)
    children_map: dict[str, list] = {}
    root_ids: list[str] = []
    for n in full_tree.nodes:
        if n.parent_id is None:
            root_ids.append(str(n.id))
        else:
            parent_key = str(n.parent_id)
            if parent_key not in children_map:
                children_map[parent_key] = []
            children_map[parent_key].append(str(n.id))

    def _depth(node_id: str) -> int:
        children = children_map.get(node_id, [])
        if not children:
            return 1
        return 1 + max(_depth(c) for c in children)

    depth = max((_depth(rid) for rid in root_ids), default=0)

    # Count leaf nodes (no children)
    leaf_count = sum(1 for n in full_tree.nodes if str(n.id) not in children_map)

    console.print(Panel(f"[bold]{full_tree.name}[/bold]", border_style="blue"))

    table = Table(title="Node Counts by Type")
    table.add_column("Type", style="bold")
    table.add_column("Count", justify="right")
    for node_type in ["outcome", "opportunity", "child_opportunity", "solution", "experiment"]:
        count = type_counts.get(node_type, 0)
        if count > 0:
            icon = NODE_ICONS.get(node_type, "")
            color = NODE_COLORS.get(node_type, "")
            table.add_row(f"[{color}]{icon} {node_type}[/{color}]", str(count))
    table.add_row("", "")
    table.add_row("[bold]Total[/bold]", f"[bold]{len(full_tree.nodes)}[/bold]")
    console.print(table)

    edge_table = Table(title="Edge Statistics")
    edge_table.add_column("Metric", style="bold")
    edge_table.add_column("Value", justify="right")
    edge_table.add_row("Total edges", str(len(full_tree.edges)))
    edge_table.add_row("[red]Risky assumptions[/red]", str(risky_count))
    for ht, count in sorted(hyp_type_counts.items()):
        edge_table.add_row(f"  {ht}", str(count))
    console.print(edge_table)

    summary_table = Table(title="Tree Structure")
    summary_table.add_column("Metric", style="bold")
    summary_table.add_column("Value", justify="right")
    summary_table.add_row("Root nodes", str(len(root_ids)))
    summary_table.add_row("Max depth", str(depth))
    summary_table.add_row("Leaf nodes", str(leaf_count))
    console.print(summary_table)


@app.command("export")
def export_tree(
    tree_id: str = typer.Argument(..., help="Tree ID (or prefix)"),
    format: str = typer.Option("json", help="Export format: json"),
):
    """Export a tree as JSON (includes project tags and bubble defaults)."""
    service = _get_service()
    data = service.export_tree(_resolve_tree_id(tree_id))
    # Use plain print to avoid Rich markup processing and word-wrapping
    print(json.dumps(data, indent=2))


@app.command("import-tree")
def import_tree(
    file_path: str = typer.Argument(..., help="Path to exported JSON file"),
    project_id: str = typer.Option(..., "--project-id", help="Project ID to import into"),
    name: Optional[str] = typer.Option(None, "--name", help="Override the tree name"),
):
    """Import a tree from an exported JSON file."""
    import json as json_mod
    from pathlib import Path

    path = Path(file_path)
    if not path.exists():
        console.print(f"[red]File not found:[/red] {file_path}")
        raise typer.Exit(1)

    try:
        tree_data = json_mod.loads(path.read_text())
    except json_mod.JSONDecodeError as e:
        console.print(f"[red]Invalid JSON:[/red] {e}")
        raise typer.Exit(1)

    if not isinstance(tree_data, dict) or "nodes" not in tree_data:
        console.print("[red]Invalid tree format: missing 'nodes' array[/red]")
        raise typer.Exit(1)

    service = _get_service()
    result = service.import_tree(
        _resolve_project_id(project_id), tree_data, name_override=name
    )
    console.print(f"[green]Imported tree:[/green] {result.name} ({result.id})")
    console.print(f"  Nodes: {len(result.nodes)}")
    console.print(f"  Edges: {len(result.edges)}")


@app.command("delete")
def delete_tree(
    tree_id: str = typer.Argument(..., help="Tree ID (or prefix)"),
    force: bool = typer.Option(False, "--force", help="Skip confirmation"),
):
    """Delete a tree and all its nodes."""
    tid = _resolve_tree_id(tree_id)
    if not force:
        service = _get_service()
        tree = service.get_tree(tid)
        confirm = typer.confirm(f"Delete tree '{tree.name}'?")
        if not confirm:
            console.print("[dim]Cancelled.[/dim]")
            raise typer.Exit(0)
    _get_service().delete_tree(tid, user_id=_get_current_user_id())
    console.print(f"[red]Deleted tree:[/red] {tree_id}")


@app.command()
def context(
    tree_id: str = typer.Argument(..., help="Tree ID (or prefix)"),
):
    """Show the project context, tree context, and agent knowledge for a tree."""
    service = _get_service()
    tid = _resolve_tree_id(tree_id)
    tree = service.get_tree(tid)
    project = service.get_project(tree.project_id)

    console.print(Panel(f"[bold]{tree.name}[/bold]", border_style="blue"))

    if project.project_context:
        console.print(Panel(project.project_context, title="Project Context", border_style="green"))
    else:
        console.print("[dim]No project context set.[/dim]")

    if tree.tree_context:
        console.print(Panel(tree.tree_context, title="Tree Context", border_style="cyan"))
    else:
        console.print("[dim]No tree context set.[/dim]")

    if tree.agent_knowledge:
        console.print(Panel(tree.agent_knowledge, title="Agent Knowledge", border_style="magenta"))
    else:
        console.print("[dim]No agent knowledge set.[/dim]")


@app.command("set-context")
def set_context(
    tree_id: str = typer.Argument(..., help="Tree ID (or prefix)"),
    tree_ctx: Optional[str] = typer.Option(None, "--tree", help="Set tree context"),
    project_ctx: Optional[str] = typer.Option(None, "--project", help="Set project context"),
):
    """Set context for a tree and/or its project."""
    service = _get_service()
    tid = _resolve_tree_id(tree_id)

    if tree_ctx is not None:
        service.update_tree(tid, TreeUpdate(tree_context=tree_ctx), user_id=_get_current_user_id())
        console.print("[green]Updated tree context.[/green]")

    if project_ctx is not None:
        tree = service.get_tree(tid)
        service.update_project(tree.project_id, ProjectUpdate(project_context=project_ctx))
        console.print("[green]Updated project context.[/green]")

    if tree_ctx is None and project_ctx is None:
        console.print("[yellow]No context specified. Use --tree and/or --project.[/yellow]")


@app.command("node")
def show_node(
    node_id: str = typer.Argument(..., help="Node ID"),
):
    """Show details of a single node."""
    service = _get_service()
    node = service.get_node(UUID(node_id))
    icon = NODE_ICONS.get(node.node_type, "")
    color = NODE_COLORS.get(node.node_type, "")

    # Build assumptions display
    assumptions = service.get_assumptions_for_node(UUID(node_id))
    if assumptions:
        assumption_lines = []
        for i, a in enumerate(assumptions):
            status_colors = {"confirmed": "[green]confirmed[/green]", "rejected": "[red]rejected[/red]"}
            status = status_colors.get(a.status, "[dim]untested[/dim]")
            assumption_lines.append(f"  #{i+1} ({status}) {a.text or '-'}")
            if a.evidence:
                assumption_lines.append(f"      Evidence: {a.evidence}")
        assumption_text = "\n".join(assumption_lines)
    else:
        assumption_text = f"  (legacy) {node.assumption or '-'}"
        if node.evidence:
            assumption_text += f"\n      Evidence: {node.evidence}"

    console.print(Panel(
        f"[{color}]{icon} {node.title}[/{color}]\n\n"
        f"[bold]Type:[/bold] {node.node_type}\n"
        f"[bold]Status:[/bold] {node.status}\n"
        f"[bold]ID:[/bold] {node.id}\n"
        f"[bold]Tree:[/bold] {node.tree_id}\n"
        f"[bold]Parent:[/bold] {node.parent_id or 'None (root)'}\n"
        f"[bold]Description:[/bold] {node.description or '-'}\n"
        f"[bold]Assumptions:[/bold]\n{assumption_text}\n"
        f"[bold]Version:[/bold] {node.version}\n"
        f"[bold]Created:[/bold] {str(node.created_at)[:19]}",
        border_style=color.replace("bold ", "") if color else "white",
    ))


@app.command("subtree")
def show_subtree(
    node_id: str = typer.Argument(..., help="Node ID"),
):
    """Show all descendants of a node."""
    service = _get_service()
    nodes = service.get_subtree(UUID(node_id))

    table = Table(title=f"Subtree of {node_id[:8]}...")
    table.add_column("ID", style="dim")
    table.add_column("Title", style="bold")
    table.add_column("Type")
    table.add_column("Status")

    for n in nodes:
        icon = NODE_ICONS.get(n.node_type, "")
        color = NODE_COLORS.get(n.node_type, "")
        table.add_row(
            str(n.id)[:8] + "...",
            f"[{color}]{icon} {n.title}[/{color}]",
            n.node_type,
            n.status,
        )

    console.print(table)


@app.command("leaves")
def show_leaves(
    tree_id: str = typer.Argument(..., help="Tree ID (or prefix)"),
):
    """Show all leaf nodes (nodes with no children) in a tree."""
    service = _get_service()
    leaves = service.get_leaves(_resolve_tree_id(tree_id))

    if not leaves:
        console.print("[dim]No leaf nodes found.[/dim]")
        return

    table = Table(title="Leaf Nodes")
    table.add_column("ID", style="dim")
    table.add_column("Title", style="bold")
    table.add_column("Type")
    table.add_column("Status")

    for n in leaves:
        icon = NODE_ICONS.get(n.node_type, "")
        color = NODE_COLORS.get(n.node_type, "")
        table.add_row(
            str(n.id)[:8] + "...",
            f"[{color}]{icon} {n.title}[/{color}]",
            n.node_type,
            n.status,
        )

    console.print(table)


@app.command("ancestors")
def show_ancestors(
    node_id: str = typer.Argument(..., help="Node ID"),
):
    """Show the path from root to a node's parent."""
    service = _get_service()
    ancestors = service.get_ancestors(UUID(node_id))

    if not ancestors:
        console.print("[dim]No ancestors (this is the root node).[/dim]")
        return

    table = Table(title=f"Ancestors of {node_id[:8]}...")
    table.add_column("Depth", justify="right")
    table.add_column("ID", style="dim")
    table.add_column("Title", style="bold")
    table.add_column("Type")

    for i, n in enumerate(ancestors):
        icon = NODE_ICONS.get(n.node_type, "")
        color = NODE_COLORS.get(n.node_type, "")
        table.add_row(
            str(i),
            str(n.id)[:8] + "...",
            f"[{color}]{icon} {n.title}[/{color}]",
            n.node_type,
        )

    console.print(table)


@app.command("merge")
def merge(
    source_tree_id: str = typer.Argument(..., help="Source tree ID (or prefix)"),
    target_tree_id: str = typer.Argument(..., help="Target tree ID (or prefix)"),
    parent_id: str = typer.Argument(..., help="Parent node ID in target tree"),
):
    """Merge a source tree into a target tree under the specified parent."""
    service = _get_service()
    service.merge_trees(
        _resolve_tree_id(source_tree_id),
        _resolve_tree_id(target_tree_id),
        UUID(parent_id),
    )
    console.print(f"[green]Merged:[/green] {source_tree_id[:8]}... → {target_tree_id[:8]}...")


@app.command()
def edit(
    node_id: str = typer.Argument(..., help="Node ID to edit"),
    title: Optional[str] = typer.Option(None, help="New title"),
    description: Optional[str] = typer.Option(None, help="New description"),
    status: Optional[str] = typer.Option(None, help="New status (active, archived)"),
    assumption: Optional[str] = typer.Option(None, help="Assumption explaining why this node matters for its parent"),
    evidence: Optional[str] = typer.Option(None, help="Supporting data, research, or observations"),
    edge_thickness: Optional[float] = typer.Option(None, "--edge-thickness", help="Edge thickness (0.5-10, 0 to clear)"),
    edge_style: Optional[str] = typer.Option(None, "--edge-style", help="Edge line style: solid, dashed, dotted (empty to clear)"),
    edge_color: Optional[str] = typer.Option(None, "--edge-color", help="Edge color as hex (e.g. #7a6f5b, empty to clear)"),
    version: Optional[int] = typer.Option(None, help="Expected version for conflict detection"),
):
    """Edit a node's title, description, status, assumption, evidence, or edge styling."""
    from ost_core.exceptions import VersionConflictError

    service = _get_service()
    try:
        node = service.update_node(
            UUID(node_id),
            NodeUpdate(
                title=title, description=description, status=status,
                assumption=assumption, evidence=evidence,
                edge_thickness=edge_thickness, edge_style=edge_style,
                edge_color=edge_color,
                version=version,
            ),
            user_id=_get_current_user_id(),
        )
    except VersionConflictError as e:
        console.print(f"[red]Conflict:[/red] {e}")
        console.print("[yellow]The node was modified by someone else. Refresh and try again.[/yellow]")
        raise typer.Exit(1)
    color = NODE_COLORS.get(node.node_type, "")
    console.print(f"[green]Updated:[/green] [{color}]{node.title}[/{color}] ({node.id})")


@app.command("rename")
def rename_tree(
    tree_id: str = typer.Argument(..., help="Tree ID (or prefix)"),
    name: str = typer.Argument(..., help="New name for the tree"),
):
    """Rename a tree."""
    service = _get_service()
    tid = _resolve_tree_id(tree_id)
    tree = service.update_tree(tid, TreeUpdate(name=name), user_id=_get_current_user_id())
    console.print(f"[green]Renamed tree:[/green] {tree.name} ({tree.id})")


@app.command("activity")
def show_activity(
    tree_id: str = typer.Argument(..., help="Tree ID (or prefix)"),
    limit: int = typer.Option(20, "--limit", help="Number of entries to show"),
):
    """Show recent activity (who changed what) for a tree."""
    service = _get_service()
    tid = _resolve_tree_id(tree_id)
    activities = service.get_tree_activity(tid, limit=limit)

    if not activities:
        console.print("[dim]No activity found.[/dim]")
        return

    table = Table(title="Recent Activity")
    table.add_column("When", style="dim")
    table.add_column("Who", style="bold")
    table.add_column("Action")
    table.add_column("Summary")

    for a in activities:
        when = str(a.created_at)[:19]
        who = a.user_display_name or "[dim]anonymous[/dim]"
        action_colors = {
            "node_created": "green",
            "node_updated": "yellow",
            "node_deleted": "red",
            "node_moved": "cyan",
            "node_reordered": "cyan",
            "tree_created": "green",
            "tree_updated": "yellow",
            "tree_deleted": "red",
            "tag_added": "blue",
            "tag_removed": "red",
            "snapshot_created": "magenta",
            "snapshot_restored": "magenta",
            "git_committed": "green",
        }
        color = action_colors.get(a.action, "")
        action_display = a.action.replace("_", " ")
        table.add_row(
            when,
            who,
            f"[{color}]{action_display}[/{color}]" if color else action_display,
            a.summary or "-",
        )

    console.print(table)


# ── Edge commands ────────────────────────────────────────────


@edge_app.command("set")
def edge_set(
    parent_id: str = typer.Argument(..., help="Parent node ID"),
    child_id: str = typer.Argument(..., help="Child node ID"),
    hypothesis: str = typer.Argument(..., help="The assumption/hypothesis text"),
    hypothesis_type: str = typer.Option("problem", "--type", help="Type: problem, solution, feasibility, desirability, viability"),
    risky: bool = typer.Option(False, "--risky", help="Mark as a risky assumption"),
    evidence: str = typer.Option("", "--evidence", help="Supporting data or observations"),
):
    """Set an assumption/hypothesis on an edge between two nodes."""
    service = _get_service()
    edge = service.set_edge_hypothesis(
        EdgeHypothesisCreate(
            parent_node_id=UUID(parent_id),
            child_node_id=UUID(child_id),
            hypothesis=hypothesis,
            hypothesis_type=HypothesisType(hypothesis_type),
            is_risky=risky,
            evidence=evidence,
        )
    )
    risk_text = " [red](RISKY)[/red]" if edge.is_risky else ""
    console.print(f"[green]Edge set:[/green] {edge.hypothesis}{risk_text} ({edge.id})")


@edge_app.command("list")
def edge_list(
    tree_id: str = typer.Argument(..., help="Tree ID (or prefix)"),
):
    """List all edge hypotheses (assumptions) in a tree."""
    service = _get_service()
    edges = service.get_edges_for_tree(_resolve_tree_id(tree_id))
    if not edges:
        console.print("[dim]No edge hypotheses found.[/dim]")
        return

    table = Table(title="Edge Hypotheses")
    table.add_column("ID", style="dim")
    table.add_column("Parent → Child", style="bold")
    table.add_column("Hypothesis")
    table.add_column("Type")
    table.add_column("Risky", justify="center")
    table.add_column("Status")
    table.add_column("Evidence", style="dim")

    for e in edges:
        risky_text = "[red]YES[/red]" if e.is_risky else "[dim]no[/dim]"
        status_colors = {"untested": "yellow", "validated": "green", "invalidated": "red"}
        status_color = status_colors.get(e.status, "")
        evidence_text = (e.evidence[:30] + "...") if e.evidence and len(e.evidence) > 30 else (e.evidence or "-")
        table.add_row(
            str(e.id)[:8] + "...",
            f"{str(e.parent_node_id)[:8]}→{str(e.child_node_id)[:8]}",
            e.hypothesis[:50] + ("..." if len(e.hypothesis) > 50 else ""),
            e.hypothesis_type.value if hasattr(e.hypothesis_type, "value") else str(e.hypothesis_type),
            risky_text,
            f"[{status_color}]{e.status}[/{status_color}]",
            evidence_text,
        )

    console.print(table)


@edge_app.command("delete")
def edge_delete(
    edge_id: str = typer.Argument(..., help="Edge hypothesis ID"),
    force: bool = typer.Option(False, "--force", help="Skip confirmation"),
):
    """Delete an edge hypothesis (assumption)."""
    service = _get_service()
    if not force:
        edge = service.get_edge_by_id(UUID(edge_id))
        confirm = typer.confirm(f"Delete assumption '{edge.hypothesis[:50]}'?")
        if not confirm:
            console.print("[dim]Cancelled.[/dim]")
            raise typer.Exit(0)
    service.delete_edge(UUID(edge_id))
    console.print(f"[red]Deleted edge:[/red] {edge_id}")


@edge_app.command("update")
def edge_update(
    edge_id: str = typer.Argument(..., help="Edge hypothesis ID"),
    hypothesis: Optional[str] = typer.Option(None, help="New hypothesis text"),
    hypothesis_type: Optional[str] = typer.Option(None, "--type", help="New type"),
    risky: Optional[bool] = typer.Option(None, "--risky", help="Mark as risky"),
    status: Optional[str] = typer.Option(None, help="New status (untested, validated, invalidated)"),
    evidence: Optional[str] = typer.Option(None, "--evidence", help="Supporting data or observations"),
):
    """Update an edge hypothesis."""
    service = _get_service()
    edge = service.update_edge(
        UUID(edge_id),
        EdgeHypothesisUpdate(
            hypothesis=hypothesis,
            hypothesis_type=HypothesisType(hypothesis_type) if hypothesis_type else None,
            is_risky=risky,
            status=status,
            evidence=evidence,
        ),
    )
    console.print(f"[green]Updated edge:[/green] {edge.hypothesis} ({edge.id})")


# ── Tag commands ─────────────────────────────────────────────


@tag_app.command("list")
def tag_list(
    project_id: str = typer.Argument(..., help="Project ID (or prefix)"),
):
    """List all tags for a project."""
    service = _get_service()
    tags = service.list_tags(_resolve_project_id(project_id))
    if not tags:
        console.print("[dim]No tags found.[/dim]")
        return

    table = Table(title="Tags")
    table.add_column("ID", style="dim")
    table.add_column("Name", style="bold")
    table.add_column("Color")
    table.add_column("Fill Style")
    table.add_column("Light Font")
    table.add_column("Created", style="dim")

    for t in tags:
        table.add_row(
            str(t.id)[:8] + "...",
            t.name,
            t.color,
            t.fill_style or "none",
            "yes" if t.font_light else "no",
            str(t.created_at)[:19],
        )

    console.print(table)


@tag_app.command("create")
def tag_create(
    project_id: str = typer.Argument(..., help="Project ID (or prefix)"),
    name: str = typer.Argument(..., help="Tag name"),
    color: str = typer.Option("#7a6f5b", "--color", help="Tag color (hex)"),
    font_light: bool = typer.Option(False, "--font-light/--no-font-light", help="Use light (white) text"),
):
    """Create a new tag for a project."""
    service = _get_service()
    tag = service.create_tag(_resolve_project_id(project_id), TagCreate(name=name, color=color, font_light=font_light))
    console.print(f"[green]Created tag:[/green] {tag.name} ({tag.id}) font_light={tag.font_light}")


@tag_app.command("update")
def tag_update(
    tag_id: str = typer.Argument(..., help="Tag ID"),
    color: Optional[str] = typer.Option(None, "--color", help="New color (hex)"),
    fill_style: Optional[str] = typer.Option(None, "--fill-style", help="Fill style: none, solid"),
    font_light: Optional[bool] = typer.Option(None, "--font-light/--no-font-light", help="Use light (white) text"),
):
    """Update a tag's color, fill style, and/or font light setting."""
    service = _get_service()
    tag = service.update_tag(UUID(tag_id), TagUpdate(color=color, fill_style=fill_style, font_light=font_light))
    console.print(f"[green]Updated tag:[/green] {tag.name} (color={tag.color}, fill={tag.fill_style or 'none'}, light_font={tag.font_light})")


@tag_app.command("delete")
def tag_delete(
    tag_id: str = typer.Argument(..., help="Tag ID"),
):
    """Delete a tag from a project."""
    service = _get_service()
    usage = service.get_tag_usage_count(UUID(tag_id))
    if usage > 0:
        console.print(f"[yellow]Warning: tag is used on {usage} node(s).[/yellow]")
    service.delete_tag(UUID(tag_id))
    console.print(f"[red]Deleted tag:[/red] {tag_id}")


@tag_app.command("add")
def tag_add(
    node_id: str = typer.Argument(..., help="Node ID"),
    tag_name: str = typer.Argument(..., help="Tag name (creates if not exists)"),
    project_id: str = typer.Option(..., "--project-id", help="Project ID"),
):
    """Add a tag to a node (creates the tag if needed)."""
    service = _get_service()
    tag = service.add_tag_to_node_by_name(UUID(node_id), tag_name, UUID(project_id), user_id=_get_current_user_id())
    console.print(f"[green]Tagged:[/green] {tag.name} → node {node_id[:8]}...")


@tag_app.command("remove")
def tag_remove(
    node_id: str = typer.Argument(..., help="Node ID"),
    tag_id: str = typer.Argument(..., help="Tag ID"),
):
    """Remove a tag from a node."""
    service = _get_service()
    service.remove_tag_from_node(UUID(node_id), UUID(tag_id), user_id=_get_current_user_id())
    console.print(f"[red]Removed tag:[/red] {tag_id[:8]}... from node {node_id[:8]}...")


# ── Git commands ─────────────────────────────────────────────


@git_app.command("status")
def git_status(
    project_id: Optional[str] = typer.Option(None, "--project-id", help="Project ID (show project-level config)"),
):
    """Show git export configuration status."""
    from ost_core.config import get_settings

    settings = get_settings()
    service = _get_service()

    table = Table(title="Git Export Configuration")
    table.add_column("Setting", style="bold")
    table.add_column("Value")

    if project_id:
        try:
            project = service.get_project(_resolve_project_id(project_id))
        except Exception as e:
            console.print(f"[red]{e}[/red]")
            raise typer.Exit(1)
        remote_url = project.git_remote_url or settings.git_remote_url or ""
        branch = project.git_branch or settings.git_branch or "main"
        table.add_row("Project", f"{project.name} ({project.id})")
        table.add_row("Remote URL (project)", project.git_remote_url or "[dim]not set (using env)[/dim]")
        table.add_row("Branch (project)", project.git_branch or "[dim]not set (using env)[/dim]")
    else:
        remote_url = settings.git_remote_url
        branch = settings.git_branch

    table.add_row("Remote URL (resolved)", remote_url or "[dim]not configured[/dim]")
    table.add_row("Branch (resolved)", branch)
    table.add_row("Token", "[green]set[/green]" if settings.resolved_git_token else "[dim]not set[/dim]")

    if not remote_url:
        console.print(table)
        console.print("[yellow]Git export not configured.[/yellow]")
        console.print("Set remote URL via project config or OST_GIT_REMOTE_URL in .env.")
        return

    console.print(table)


@git_app.command("commit")
def git_commit(
    tree_id: str = typer.Argument(..., help="Tree ID (or prefix)"),
    message: str = typer.Option("", "-m", "--message", help="Commit message"),
    author_name: Optional[str] = typer.Option(None, "--author-name", help="Author name"),
    author_email: Optional[str] = typer.Option(None, "--author-email", help="Author email"),
):
    """Export a tree as JSON and commit + push to the configured git remote."""
    from ost_core.config import get_settings
    from ost_core.exceptions import (
        GitAuthenticationError,
        GitNotConfiguredError,
        GitOperationError,
        GitPushConflictError,
        ProjectNotFoundError,
        TreeNotFoundError,
    )
    from ost_core.services.git_service import commit_tree_to_git

    service = _get_service()
    settings = get_settings()
    tid = _resolve_tree_id(tree_id)

    try:
        tree = service.get_tree(tid)
        project = service.get_project(tree.project_id)
    except (TreeNotFoundError, ProjectNotFoundError) as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1)

    tree_json = service.export_tree(tid)

    commit_msg = message or f"Update {tree.name}"

    # Resolve config: project-level > env-level
    remote_url = project.git_remote_url or settings.git_remote_url or ""
    branch = project.git_branch or settings.git_branch or "main"
    token = settings.resolved_git_token
    resolved_author_name = author_name or settings.user_name or ""
    resolved_author_email = author_email or settings.user_email or ""

    # Pre-fill from authenticated user if not provided
    if not resolved_author_name or not resolved_author_email:
        uid = _get_current_user_id()
        if uid:
            try:
                user = service.get_user(uid)
                if not resolved_author_name:
                    resolved_author_name = user.display_name
                if not resolved_author_email:
                    resolved_author_email = user.email
            except Exception:
                pass

    try:
        with console.status("Committing to git..."):
            result = commit_tree_to_git(
                tree_json=tree_json,
                project_name=project.name,
                tree_name=tree.name,
                commit_message=commit_msg,
                remote_url=remote_url,
                branch=branch,
                token=token,
                author_name=resolved_author_name,
                author_email=resolved_author_email,
            )
    except GitNotConfiguredError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1)
    except GitAuthenticationError as e:
        console.print(f"[red]Authentication failed:[/red] {e}")
        console.print("[yellow]Tip: Set GIT_TOKEN in .env for HTTPS authentication.[/yellow]")
        raise typer.Exit(1)
    except GitPushConflictError as e:
        console.print(f"[red]Push conflict:[/red] {e}")
        raise typer.Exit(1)
    except GitOperationError as e:
        console.print(f"[red]Git error:[/red] {e}")
        raise typer.Exit(1)

    if result.no_changes:
        console.print("[yellow]No changes — tree JSON is already up to date.[/yellow]")
        console.print(f"  File: {result.file_path}")
        console.print(f"  Branch: {result.branch}")
    else:
        console.print("[green]Committed and pushed![/green]")
        console.print(f"  SHA: {result.commit_sha[:12]}")
        console.print(f"  File: {result.file_path}")
        console.print(f"  Branch: {result.branch}")

        # Log the commit
        if resolved_author_name and resolved_author_email:
            try:
                service.create_git_commit_log(
                    project_id=tree.project_id,
                    tree_id=tree.id,
                    commit_sha=result.commit_sha,
                    author_name=resolved_author_name,
                    author_email=resolved_author_email,
                    commit_message=commit_msg,
                    file_path=result.file_path,
                    branch=result.branch,
                    remote_url=remote_url,
                )
            except Exception:
                pass

        # Log activity
        try:
            service.repo.log_activity_standalone(
                user_id=_get_current_user_id(),
                action="git_committed",
                resource_type="tree",
                resource_id=str(tree.id),
                tree_id=str(tree.id),
                project_id=str(tree.project_id),
                summary=f"Git commit: {commit_msg}",
                details={"commit_sha": result.commit_sha, "branch": result.branch},
            )
        except Exception:
            pass


@git_app.command("config")
def git_config(
    project_id: str = typer.Argument(..., help="Project ID (or prefix)"),
    remote_url: Optional[str] = typer.Option(None, "--remote-url", help="Git remote URL"),
    branch: Optional[str] = typer.Option(None, "--branch", help="Git branch"),
):
    """Set git remote URL and/or branch for a project."""
    from ost_core.models import ProjectUpdate

    service = _get_service()
    pid = _resolve_project_id(project_id)

    update_data = ProjectUpdate()
    if remote_url is not None:
        update_data.git_remote_url = remote_url
    if branch is not None:
        update_data.git_branch = branch

    if remote_url is None and branch is None:
        console.print("[yellow]No config specified. Use --remote-url and/or --branch.[/yellow]")
        return

    project = service.update_project(pid, update_data)
    console.print(f"[green]Updated git config for project:[/green] {project.name}")
    if project.git_remote_url:
        console.print(f"  Remote: {project.git_remote_url}")
    console.print(f"  Branch: {project.git_branch}")


@git_app.command("authors")
def git_authors(
    project_id: str = typer.Argument(..., help="Project ID (or prefix)"),
):
    """List distinct authors from git commit history."""
    service = _get_service()
    pid = _resolve_project_id(project_id)
    authors = service.get_git_authors(pid)

    if not authors:
        console.print("[dim]No commit authors found.[/dim]")
        return

    table = Table(title="Git Authors")
    table.add_column("Name", style="bold")
    table.add_column("Email")

    for a in authors:
        table.add_row(a.name, a.email)

    console.print(table)


@git_app.command("history")
def git_history(
    project_id: str = typer.Argument(..., help="Project ID (or prefix)"),
    limit: int = typer.Option(20, "--limit", help="Number of commits to show"),
):
    """Show git commit history for a project."""
    service = _get_service()
    pid = _resolve_project_id(project_id)
    logs = service.list_git_commit_logs(pid, limit=limit)

    if not logs:
        console.print("[dim]No commits found.[/dim]")
        return

    table = Table(title="Git Commit History")
    table.add_column("SHA", style="dim")
    table.add_column("Author", style="bold")
    table.add_column("Message")
    table.add_column("File")
    table.add_column("Branch")
    table.add_column("Date", style="dim")

    for log in logs:
        table.add_row(
            str(log.commit_sha)[:12],
            f"{log.author_name} <{log.author_email}>",
            log.commit_message[:50] + ("..." if len(log.commit_message) > 50 else ""),
            log.file_path,
            log.branch,
            str(log.created_at)[:19],
        )

    console.print(table)




# ── Auth commands ────────────────────────────────────────────


def _token_path():
    from pathlib import Path
    path = Path.home() / ".ost"
    path.mkdir(exist_ok=True)
    return path / "token"


def _save_token(token: str):
    _token_path().write_text(token)


def _load_token() -> str | None:
    path = _token_path()
    if path.exists():
        return path.read_text().strip()
    return None


def _clear_token():
    path = _token_path()
    if path.exists():
        path.unlink()


def _get_current_user_id() -> str | None:
    """Extract user_id from saved token, if available."""
    from ost_core.auth import decode_token

    token = _load_token()
    if not token:
        return None
    try:
        payload = decode_token(token)
        return payload.get("sub")
    except Exception:
        return None


@auth_app.command("register")
def auth_register(
    email: str = typer.Option(..., prompt=True, help="Email address"),
    display_name: str = typer.Option(..., "--name", prompt="Display name", help="Display name"),
    password: str = typer.Option(..., prompt=True, hide_input=True, confirmation_prompt=True, help="Password (min 8 chars)"),
):
    """Register a new user account."""
    from ost_core.exceptions import AuthenticationError, DuplicateEmailError
    from ost_core.models import UserCreate

    service = _get_service()
    try:
        user, token = service.register(UserCreate(email=email, display_name=display_name, password=password))
    except DuplicateEmailError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1)
    except AuthenticationError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1)
    except Exception as e:
        console.print(f"[red]Registration failed: {e}[/red]")
        raise typer.Exit(1)

    _save_token(token)
    console.print(f"[green]Registered![/green] Welcome, {user.display_name} ({user.email})")
    console.print(f"  Token saved to {_token_path()}")


@auth_app.command("login")
def auth_login(
    email: str = typer.Option(..., prompt=True, help="Email address"),
    password: str = typer.Option(..., prompt=True, hide_input=True, help="Password"),
):
    """Log in to an existing account."""
    from ost_core.exceptions import AuthenticationError

    service = _get_service()
    try:
        user, token = service.login(email, password)
    except AuthenticationError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1)

    _save_token(token)
    console.print(f"[green]Logged in![/green] Welcome back, {user.display_name}")


@auth_app.command("me")
def auth_me():
    """Show the currently authenticated user."""
    from ost_core.auth import decode_token

    token = _load_token()
    if not token:
        console.print("[yellow]Not logged in. Run 'ost auth login' first.[/yellow]")
        raise typer.Exit(1)

    try:
        payload = decode_token(token)
        user_id = payload["sub"]
    except Exception:
        console.print("[red]Token expired or invalid. Please log in again.[/red]")
        _clear_token()
        raise typer.Exit(1)

    service = _get_service()
    try:
        user = service.get_user(user_id)
    except Exception:
        console.print("[red]User not found. Please log in again.[/red]")
        _clear_token()
        raise typer.Exit(1)

    console.print(Panel(
        f"[bold]{user.display_name}[/bold]\n"
        f"Email: {user.email}\n"
        f"ID: {user.id}\n"
        f"Active: {'yes' if user.is_active else 'no'}\n"
        f"Created: {str(user.created_at)[:19]}",
        title="Current User",
        border_style="green",
    ))


@auth_app.command("logout")
def auth_logout():
    """Clear the saved authentication token."""
    _clear_token()
    console.print("[green]Logged out.[/green]")


# ── Assumption commands ──────────────────────────────────────


@assumption_app.command("add")
def assumption_add(
    node_id: str = typer.Argument(..., help="Node ID"),
    text: str = typer.Argument(..., help="Assumption text"),
    evidence: str = typer.Option("", "--evidence", "-e", help="Supporting evidence"),
):
    """Add a new assumption to a node."""
    service = _get_service()
    assumption = service.add_assumption(
        UUID(node_id),
        NodeAssumptionCreate(text=text, evidence=evidence),
    )
    console.print(f"[green]Added assumption {str(assumption.id)[:8]}... to node {node_id[:8]}...[/green]")
    console.print(f"  Text: {assumption.text}")
    if assumption.evidence:
        console.print(f"  Evidence: {assumption.evidence}")


@assumption_app.command("list")
def assumption_list(
    node_id: str = typer.Argument(..., help="Node ID"),
):
    """List all assumptions for a node."""
    service = _get_service()
    assumptions = service.get_assumptions_for_node(UUID(node_id))

    if not assumptions:
        console.print(f"[dim]No assumptions on node {node_id[:8]}...[/dim]")
        return

    table = Table(title=f"Assumptions for node {node_id[:8]}...")
    table.add_column("#", style="dim", width=3)
    table.add_column("ID", style="dim")
    table.add_column("Assumption", style="bold")
    table.add_column("Evidence")
    table.add_column("Status")

    for i, a in enumerate(assumptions):
        status_colors = {"confirmed": "[green]confirmed[/green]", "rejected": "[red]rejected[/red]"}
        status = status_colors.get(a.status, "[dim]untested[/dim]")
        table.add_row(
            str(i + 1),
            str(a.id)[:8] + "...",
            a.text or "-",
            a.evidence or "-",
            status,
        )

    console.print(table)


@assumption_app.command("update")
def assumption_update(
    assumption_id: str = typer.Argument(..., help="Assumption ID"),
    text: Optional[str] = typer.Option(None, "--text", "-t", help="New assumption text"),
    evidence: Optional[str] = typer.Option(None, "--evidence", "-e", help="New evidence"),
    status: Optional[str] = typer.Option(None, "--status", "-s", help="Status: untested, confirmed, or rejected"),
):
    """Update an assumption's text, evidence, or status."""
    service = _get_service()
    data = NodeAssumptionUpdate(text=text, evidence=evidence, status=status)
    assumption = service.update_assumption(UUID(assumption_id), data)
    console.print(f"[green]Updated assumption {str(assumption.id)[:8]}... ({assumption.status})[/green]")
    console.print(f"  Text: {assumption.text}")
    if assumption.evidence:
        console.print(f"  Evidence: {assumption.evidence}")


@assumption_app.command("reject")
def assumption_reject(
    assumption_id: str = typer.Argument(..., help="Assumption ID"),
):
    """Mark an assumption as rejected."""
    service = _get_service()
    assumption = service.update_assumption(
        UUID(assumption_id),
        NodeAssumptionUpdate(status="rejected"),
    )
    console.print(f"[red]Rejected assumption {str(assumption.id)[:8]}...[/red]")
    console.print(f"  Text: {assumption.text}")


@assumption_app.command("delete")
def assumption_delete(
    assumption_id: str = typer.Argument(..., help="Assumption ID"),
    force: bool = typer.Option(False, "--force", "-f", help="Skip confirmation"),
):
    """Delete an assumption."""
    if not force:
        confirm = typer.confirm("Delete this assumption?")
        if not confirm:
            raise typer.Abort()
    service = _get_service()
    service.delete_assumption(UUID(assumption_id))
    console.print(f"[green]Deleted assumption {assumption_id[:8]}...[/green]")


if __name__ == "__main__":
    app()
