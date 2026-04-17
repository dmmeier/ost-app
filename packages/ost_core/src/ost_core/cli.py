"""CLI tool for Opportunity Solution Tree operations."""

import os
from uuid import UUID

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.tree import Tree as RichTree

from ost_core.dependencies import get_tree_service, get_validator
from ost_core.db.engine import get_engine, get_session_factory, init_db
from ost_core.db.repository import TreeRepository
from ost_core.models import (
    EdgeHypothesisCreate,
    EdgeHypothesisUpdate,
    HypothesisType,
    NodeCreate,
    NodeType,
    NodeUpdate,
)

app = typer.Typer(
    name="ost",
    help="CLI for managing Opportunity Solution Trees.",
    no_args_is_help=True,
)
console = Console()

# ── Helpers ────────────────────────────────────────────────────


def _db_url() -> str:
    """Resolve the database URL from env or default."""
    return os.environ.get("OST_DATABASE_URL", "sqlite:///ost.db")


def _service():
    return get_tree_service(_db_url())


def _validator():
    return get_validator(_db_url())


def _repo():
    """Get a TreeRepository instance."""
    url = _db_url()
    engine = get_engine(url)
    init_db(engine)
    session_factory = get_session_factory(engine)
    return TreeRepository(session_factory)


NODE_TYPE_ICONS = {
    "outcome": "[bold magenta]O[/]",
    "opportunity": "[bold blue]Opp[/]",
    "child_opportunity": "[bold cyan]COpp[/]",
    "solution": "[bold green]Sol[/]",
    "experiment": "[bold yellow]Exp[/]",
}

NODE_TYPE_COLORS = {
    "outcome": "magenta",
    "opportunity": "blue",
    "child_opportunity": "cyan",
    "solution": "green",
    "experiment": "yellow",
}


def _infer_hypothesis_type(node_type: NodeType) -> HypothesisType:
    """Infer a default hypothesis type from the node type."""
    if node_type in (NodeType.OUTCOME, NodeType.OPPORTUNITY, NodeType.CHILD_OPPORTUNITY):
        return HypothesisType.PROBLEM
    elif node_type == NodeType.SOLUTION:
        return HypothesisType.SOLUTION
    else:  # experiment
        return HypothesisType.FEASIBILITY


# ── Tree commands ──────────────────────────────────────────────


@app.command("list-trees")
def list_trees():
    """List all trees."""
    svc = _service()
    trees = svc.list_trees()
    if not trees:
        console.print("[dim]No trees found.[/]")
        return

    table = Table(title="Opportunity Solution Trees")
    table.add_column("ID", style="dim")
    table.add_column("Name", style="bold")
    table.add_column("Description")
    table.add_column("Created", style="dim")

    for t in trees:
        table.add_row(
            str(t.id),
            t.name,
            t.description[:60] + "..." if len(t.description) > 60 else t.description,
            t.created_at.strftime("%Y-%m-%d %H:%M"),
        )

    console.print(table)


@app.command("show")
def show_tree(
    tree_id: str = typer.Argument(..., help="Tree UUID"),
):
    """Show a tree as a visual hierarchy."""
    svc = _service()
    tid = UUID(tree_id)
    full = svc.get_full_tree(tid)

    # Build lookup structures
    node_map = {n.id: n for n in full.nodes}
    children_map: dict[UUID, list] = {}
    root = None
    for n in full.nodes:
        if n.parent_id is None:
            root = n
        else:
            children_map.setdefault(n.parent_id, []).append(n)

    if root is None:
        console.print("[red]Tree has no root node.[/]")
        return

    def _label(node) -> str:
        nt_val = node.node_type.value if hasattr(node.node_type, "value") else node.node_type
        icon = NODE_TYPE_ICONS.get(nt_val, "?")
        return f"{icon} {node.title}  [dim]({node.id})[/]"

    # Build rich tree
    rich_tree = RichTree(
        Panel(
            f"[bold]{full.name}[/]\n{full.description}",
            subtitle=f"Tree {full.id}",
        )
    )

    def _add_children(parent_branch, parent_id):
        kids = children_map.get(parent_id, [])
        # Sort by type for a consistent ordering
        type_order = ["opportunity", "child_opportunity", "solution", "experiment"]
        kids.sort(key=lambda n: type_order.index(n.node_type) if n.node_type in type_order else 99)
        for child in kids:
            branch = parent_branch.add(_label(child))
            _add_children(branch, child.id)

    root_branch = rich_tree.add(_label(root))
    _add_children(root_branch, root.id)

    console.print(rich_tree)
    console.print(f"\n[dim]Total nodes: {len(full.nodes)}[/]")


@app.command("add-node")
def add_node(
    tree_id: str = typer.Argument(..., help="Tree UUID"),
    title: str = typer.Option(..., "--title", "-t", help="Node title"),
    node_type: str = typer.Option(..., "--type", "-T", help="Node type: outcome, opportunity, child_opportunity, solution, experiment"),
    parent_id: str = typer.Option(None, "--parent", "-p", help="Parent node UUID (omit for root/outcome)"),
    description: str = typer.Option("", "--desc", "-d", help="Node description"),
    hypothesis: str = typer.Option(None, "--hypothesis", "-H", help="Edge hypothesis text (auto-creates edge to parent)"),
    risky: bool = typer.Option(False, "--risky", help="Mark hypothesis as risky"),
):
    """Add a node to a tree. Auto-creates an edge with hypothesis when --parent is given."""
    svc = _service()
    tid = UUID(tree_id)

    try:
        nt = NodeType(node_type)
    except ValueError:
        console.print(f"[red]Invalid node type: {node_type}[/]")
        console.print(f"Valid types: {', '.join([t.value for t in NodeType])}")
        raise typer.Exit(1)

    pid = UUID(parent_id) if parent_id else None

    data = NodeCreate(
        title=title,
        description=description,
        node_type=nt,
        parent_id=pid,
    )

    try:
        node = svc.add_node(tid, data)
        console.print(f"[green]Node added successfully![/]")
        console.print(f"  ID:     {node.id}")
        console.print(f"  Title:  {node.title}")
        console.print(f"  Type:   {node.node_type.value}")
        console.print(f"  Parent: {node.parent_id or '(root)'}")

        # Auto-create edge with hypothesis when parent exists
        if pid:
            h_type = _infer_hypothesis_type(nt)
            h_text = hypothesis or f"We believe {title.lower()} will help"
            edge_data = EdgeHypothesisCreate(
                parent_node_id=pid,
                child_node_id=node.id,
                hypothesis=h_text,
                hypothesis_type=h_type,
                is_risky=risky,
            )
            edge = svc.set_edge_hypothesis(edge_data)
            console.print(f"  Edge:   {edge.id}")
            console.print(f"  Hyp:    {edge.hypothesis[:60]}{'...' if len(edge.hypothesis) > 60 else ''}")
            if not hypothesis:
                console.print(f"  [yellow]! Default hypothesis created. Use 'set-hypothesis' to refine.[/]")
    except Exception as e:
        console.print(f"[red]Error adding node: {e}[/]")
        raise typer.Exit(1)


@app.command("remove-node")
def remove_node(
    node_id: str = typer.Argument(..., help="Node UUID to remove"),
    cascade: bool = typer.Option(True, "--cascade/--no-cascade", help="Remove children too"),
):
    """Remove a node (and optionally its children)."""
    svc = _service()
    nid = UUID(node_id)

    try:
        svc.remove_node(nid, cascade=cascade)
        console.print(f"[green]Node {node_id} removed.[/]")
    except Exception as e:
        console.print(f"[red]Error: {e}[/]")
        raise typer.Exit(1)


@app.command("children")
def show_children(
    node_id: str = typer.Argument(..., help="Parent node UUID"),
):
    """Show children of a node."""
    svc = _service()
    nid = UUID(node_id)
    children = svc.get_children(nid)

    if not children:
        console.print("[dim]No children found.[/]")
        return

    table = Table(title="Children")
    table.add_column("ID", style="dim")
    table.add_column("Type")
    table.add_column("Title", style="bold")
    table.add_column("Status")

    for c in children:
        nt_val = c.node_type.value if hasattr(c.node_type, "value") else c.node_type
        color = NODE_TYPE_COLORS.get(nt_val, "white")
        table.add_row(str(c.id), f"[{color}]{nt_val}[/]", c.title, c.status)

    console.print(table)


@app.command("validate")
def validate_tree(
    tree_id: str = typer.Argument(..., help="Tree UUID"),
):
    """Validate tree structural rules."""
    validator = _validator()
    tid = UUID(tree_id)

    report = validator.validate(tid)

    if report.is_valid and not report.issues:
        console.print(Panel("[bold green]Tree is valid! No issues found.[/]", title="Validation"))
        return

    status = "[bold green]VALID[/]" if report.is_valid else "[bold red]INVALID[/]"
    console.print(Panel(f"Tree status: {status}", title="Validation Report"))

    # Group by severity
    errors = [i for i in report.issues if i.severity.value == "error"]
    warnings = [i for i in report.issues if i.severity.value == "warning"]
    infos = [i for i in report.issues if i.severity.value == "info"]

    if errors:
        console.print(f"\n[bold red]Errors ({len(errors)}):[/]")
        for issue in errors:
            console.print(f"  [red]x[/] [{issue.rule}] {issue.message}")
            if issue.suggestion:
                console.print(f"    [dim]Suggestion: {issue.suggestion}[/]")

    if warnings:
        console.print(f"\n[bold yellow]Warnings ({len(warnings)}):[/]")
        for issue in warnings:
            console.print(f"  [yellow]![/] [{issue.rule}] {issue.message}")
            if issue.suggestion:
                console.print(f"    [dim]Suggestion: {issue.suggestion}[/]")

    if infos:
        console.print(f"\n[bold blue]Info ({len(infos)}):[/]")
        for issue in infos:
            console.print(f"  [blue]i[/] [{issue.rule}] {issue.message}")

    console.print(f"\n[dim]Total issues: {len(report.issues)} "
                  f"({len(errors)} errors, {len(warnings)} warnings, {len(infos)} info)[/]")


@app.command("node-info")
def node_info(
    node_id: str = typer.Argument(..., help="Node UUID"),
):
    """Show detailed info about a node."""
    svc = _service()
    nid = UUID(node_id)

    try:
        node = svc.get_node(nid)
        nt_val = node.node_type.value if hasattr(node.node_type, "value") else node.node_type
        color = NODE_TYPE_COLORS.get(nt_val, "white")

        # Try to get incoming edge hypothesis
        edge_info = ""
        if node.parent_id:
            edge = svc.get_edge_hypothesis(node.parent_id, nid)
            if edge:
                risk = " [bold red](RISKY)[/]" if edge.is_risky else ""
                edge_info = (
                    f"\n[bold]Edge Hypothesis:[/] {edge.hypothesis}{risk}"
                    f"\n[bold]Hypothesis Type:[/] {edge.hypothesis_type.value if hasattr(edge.hypothesis_type, 'value') else edge.hypothesis_type}"
                    f"\n[bold]Edge Status:[/] {edge.status}"
                )
            else:
                edge_info = "\n[bold]Edge Hypothesis:[/] [yellow](none — missing)[/]"

        console.print(Panel(
            f"[bold]Title:[/] {node.title}\n"
            f"[bold]Type:[/] [{color}]{nt_val}[/]\n"
            f"[bold]ID:[/] {node.id}\n"
            f"[bold]Tree ID:[/] {node.tree_id}\n"
            f"[bold]Parent:[/] {node.parent_id or '(root)'}\n"
            f"[bold]Status:[/] {node.status}\n"
            f"[bold]Description:[/] {node.description or '(none)'}"
            f"{edge_info}\n"
            f"[bold]Created:[/] {node.created_at.strftime('%Y-%m-%d %H:%M')}\n"
            f"[bold]Updated:[/] {node.updated_at.strftime('%Y-%m-%d %H:%M')}",
            title="Node Details",
        ))
    except Exception as e:
        console.print(f"[red]Error: {e}[/]")
        raise typer.Exit(1)


@app.command("update-node")
def update_node_cmd(
    node_id: str = typer.Argument(..., help="Node UUID"),
    title: str = typer.Option(None, "--title", "-t", help="New title"),
    description: str = typer.Option(None, "--desc", "-d", help="New description"),
    status: str = typer.Option(None, "--status", "-s", help="New status (active/archived)"),
    node_type: str = typer.Option(None, "--type", "-T", help="Change node type"),
):
    """Update an existing node's title, description, status, or type."""
    svc = _service()
    nid = UUID(node_id)

    nt = None
    if node_type:
        try:
            nt = NodeType(node_type)
        except ValueError:
            console.print(f"[red]Invalid node type: {node_type}[/]")
            console.print(f"Valid types: {', '.join([t.value for t in NodeType])}")
            raise typer.Exit(1)

    data = NodeUpdate(
        title=title,
        description=description,
        status=status,
        node_type=nt,
    )

    # Check at least one field is set
    if all(v is None for v in [title, description, status, nt]):
        console.print("[yellow]No updates specified. Use --title, --desc, --status, or --type.[/]")
        raise typer.Exit(1)

    try:
        node = svc.update_node(nid, data)
        nt_val = node.node_type.value if hasattr(node.node_type, "value") else node.node_type
        console.print(f"[green]Node updated![/]")
        console.print(f"  Title:  {node.title}")
        console.print(f"  Type:   {nt_val}")
        console.print(f"  Status: {node.status}")
    except Exception as e:
        console.print(f"[red]Error: {e}[/]")
        raise typer.Exit(1)


@app.command("set-hypothesis")
def set_hypothesis(
    parent_id: str = typer.Argument(..., help="Parent node UUID"),
    child_id: str = typer.Argument(..., help="Child node UUID"),
    text: str = typer.Option(..., "--text", "-t", help="Hypothesis text"),
    hyp_type: str = typer.Option("problem", "--type", "-T", help="Type: problem, solution, feasibility, desirability, viability"),
    risky: bool = typer.Option(False, "--risky", help="Mark as risky assumption"),
):
    """Set or update the hypothesis on an edge between two nodes."""
    svc = _service()
    pid = UUID(parent_id)
    cid = UUID(child_id)

    try:
        ht = HypothesisType(hyp_type)
    except ValueError:
        console.print(f"[red]Invalid hypothesis type: {hyp_type}[/]")
        console.print(f"Valid types: {', '.join([t.value for t in HypothesisType])}")
        raise typer.Exit(1)

    # Check if edge already exists
    existing = svc.get_edge_hypothesis(pid, cid)
    if existing:
        # Update existing edge
        update_data = EdgeHypothesisUpdate(
            hypothesis=text,
            hypothesis_type=ht,
            is_risky=risky,
        )
        edge = svc.update_edge(existing.id, update_data)
        console.print(f"[green]Hypothesis updated![/]")
    else:
        # Create new edge
        create_data = EdgeHypothesisCreate(
            parent_node_id=pid,
            child_node_id=cid,
            hypothesis=text,
            hypothesis_type=ht,
            is_risky=risky,
        )
        edge = svc.set_edge_hypothesis(create_data)
        console.print(f"[green]Hypothesis created![/]")

    console.print(f"  Edge ID: {edge.id}")
    console.print(f"  Text:    {edge.hypothesis[:60]}{'...' if len(edge.hypothesis) > 60 else ''}")
    console.print(f"  Type:    {edge.hypothesis_type.value if hasattr(edge.hypothesis_type, 'value') else edge.hypothesis_type}")
    console.print(f"  Risky:   {'Yes' if edge.is_risky else 'No'}")


# ── Snapshot commands ──────────────────────────────────────────


@app.command("snapshots")
def list_snapshots(
    tree_id: str = typer.Argument(..., help="Tree UUID"),
):
    """List all snapshots for a tree."""
    repo = _repo()
    tid = UUID(tree_id)
    snaps = repo.list_snapshots(tid)

    if not snaps:
        console.print("[dim]No snapshots found.[/]")
        return

    table = Table(title="Snapshots")
    table.add_column("ID", style="dim")
    table.add_column("Message", style="bold")
    table.add_column("Nodes", justify="right")
    table.add_column("Edges", justify="right")
    table.add_column("Created", style="dim")

    for s in snaps:
        table.add_row(
            s["id"],
            s["message"],
            str(s["node_count"]),
            str(s["edge_count"]),
            s["created_at"][:19],
        )

    console.print(table)


@app.command("snapshot-create")
def create_snapshot(
    tree_id: str = typer.Argument(..., help="Tree UUID"),
    message: str = typer.Option(..., "--message", "-m", help="Snapshot message"),
):
    """Create a snapshot of the current tree state."""
    repo = _repo()
    tid = UUID(tree_id)

    try:
        result = repo.create_snapshot(tid, message)
        console.print(f"[green]Snapshot created![/]")
        console.print(f"  ID:    {result['id']}")
        console.print(f"  Nodes: {result['node_count']}")
        console.print(f"  Edges: {result['edge_count']}")
    except Exception as e:
        console.print(f"[red]Error: {e}[/]")
        raise typer.Exit(1)


@app.command("snapshot-restore")
def restore_snapshot(
    tree_id: str = typer.Argument(..., help="Tree UUID (for confirmation)"),
    snapshot_id: str = typer.Option(..., "--snapshot", "-s", help="Snapshot UUID to restore"),
    force: bool = typer.Option(False, "--force", "-f", help="Skip confirmation prompt"),
):
    """Restore a tree from a snapshot."""
    repo = _repo()

    if not force:
        confirm = typer.confirm(
            f"This will replace ALL nodes in tree {tree_id} with the snapshot. Continue?"
        )
        if not confirm:
            console.print("[dim]Cancelled.[/]")
            raise typer.Exit(0)

    try:
        repo.restore_snapshot(snapshot_id)
        console.print(f"[green]Tree restored from snapshot {snapshot_id}![/]")
    except Exception as e:
        console.print(f"[red]Error: {e}[/]")
        raise typer.Exit(1)


if __name__ == "__main__":
    app()
