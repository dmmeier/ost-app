# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack Opportunity Solution Tree (OST) app for product discovery. Core logic in Python, web frontend in Next.js, exposed via REST API, MCP server, and CLI.

## Architecture

**UV Workspace Monorepo** with four packages:

- `packages/ost_core` — Core library: SQLAlchemy models, repository (closure table), services, validation engine
- `services/api` — FastAPI REST API (port 8000)
- `services/cli` — Typer CLI tool (`ost` command)
- `services/mcp` — FastMCP server for AI tool access
- `frontend/` — Next.js 16 + React 19 + ReactFlow + Zustand + TanStack Query

**Data model**: Trees contain Nodes (outcome > opportunity > child_opportunity > solution > experiment) with assumptions stored directly on each node. Closure table enables efficient ancestor/descendant queries.

## Common Commands

```bash
# Run all Python tests (must run from project root)
uv run pytest

# Run a single test file
uv run pytest packages/ost_core/tests/test_service.py -v

# Start API server
uv run uvicorn ost_api.main:app --reload --port 8000

# Start frontend dev server
cd frontend && npm run dev

# TypeScript check (must run from frontend/)
cd frontend && npx tsc --noEmit

# CLI commands
uv run ost list
uv run ost show <tree-id>
uv run ost stats <tree-id>
uv run ost validate <tree-id>
uv run ost export <tree-id>

# Lint
uv run ruff check .
```

## Key Technical Details

- **Python 3.12+**: Use `datetime.now(UTC)` not `datetime.utcnow()`
- **SQLite in-memory tests**: Use `StaticPool` and `check_same_thread=False` for FastAPI TestClient
- **Closure table**: Must `session.flush()` after inserting a node row before inserting closure table entries
- **Test directories**: Don't put `__init__.py` in test dirs — causes import collisions across packages
- **API base URL**: Default is `http://localhost:8000/api/v1` (not 8001)
- **react-resizable-panels v3**: Uses `orientation` prop, exports `Group/Panel/Separator`
- **Node validation rules**: See `docs/ost_recipe.md` for OST theory, node types, structural rules

## Project Structure

```
packages/ost_core/src/ost_core/
  models/          # Pydantic models (node.py, edge.py, tree.py, validation.py)
  db/
    schema.py      # SQLAlchemy ORM (NodeRow, EdgeRow, ClosureRow, SnapshotRow, ChatMessageRow)
    repository.py  # Data access layer with closure table operations
  services/
    tree_service.py    # Business logic (CRUD, move_subtree, snapshots, chat history)
    validation.py      # Structural validation engine (fan-out, edge completeness, structural rules)
  dependencies.py      # Factory functions for fresh DB sessions

services/api/src/ost_api/
  main.py          # FastAPI app with CORS for localhost:3000
  routers/         # trees, nodes, edges, validation, chat, feedback, settings

frontend/src/
  app/page.tsx           # Main layout with 3-panel ResizablePanelGroup
  components/tree/       # TreeCanvas (ReactFlow), OSTNode, HypothesisEdge
  components/panels/     # NodeDetailPanel, ValidationPanel, VersionPanel, ContextPanel, TreeSelector
  components/chat/       # ChatPanel (coach + builder modes)
  lib/api-client.ts      # Typed API client
  lib/types.ts           # TypeScript type definitions
  stores/tree-store.ts   # Zustand state management
  hooks/use-tree.ts      # TanStack Query hooks
```

## Building instructions
-- Work through tickets in "tickets" in order
-- Make sure you do careful planning before starting implementation. 
-- Use agent teams in most cases; make sure you have a Product manager, a product designer, an engineer, a quality assurance / testing engineer as well as a code quality engineer working together. 
-- for each item run at least 5-10 improvement loops, where the PM and product designer work together (using playwright mcp) to play through concrete examples; they should involve other expert agents as required. When things are noticed that are not optimal from a logical or user perspective, then this should be fixed. Afterwards, a new improvement cycle should start. Only stop improving once things are stable. 
-- keep a running diary of your notes in "tickets"; it is crucial that you keep tabs on which elements of the ticket backlog are in progress and which ones are completed. Do not remove the original tickets though; just make sure they are clearly annotated with current status to avoid confusion. 
-- Make sure you keep api, cli, mcp in Sync if relevant changes are made. As a rule, everything should be available through these interfaces EXCEPT clearly only visual things (like a color change of a node, for instance, is not necessary to be able to do via api/cli/mcp). Of course you can choose to implement such visual features via apis etc, so it is not forbidden to use these interfaces for graphical elements. 
-- Once you are happy with all changes, commit and push to github
-- After each ticket, make sure you clear context and keep going