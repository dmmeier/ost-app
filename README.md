# Opportunity Solution Tree (OST)

A full-stack application for building, managing, and validating [Opportunity Solution Trees](https://www.producttalk.org/opportunity-solution-tree/) — the product discovery framework by Teresa Torres.

## Features

- **Visual Tree Builder** — Interactive canvas (ReactFlow) for creating and editing OST structures with drag-and-drop, multi-root support, and compact layout mode
- **AI-Powered Coach** — Chat interface powered by Claude that can both coach you through product discovery and directly modify the tree
- **Structural Validation** — Built-in rules engine that checks fan-out, missing assumptions, type hierarchy, and other OST best practices
- **Version Control** — Snapshot and restore tree states; export trees to a Git repository
- **Customizable Styling** — Per-node style overrides, custom bubble types, fill patterns, tag-based coloring, light font toggle
- **Multiple Interfaces** — Web UI, REST API, and CLI (`ost` command)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12, FastAPI, SQLAlchemy |
| Frontend | Next.js, React 19, ReactFlow, Zustand, TanStack Query |
| Database | **SQLite** (default) or PostgreSQL |
| AI | Anthropic Claude API (optional) |

---

## Quick Start (Local Development)

### Prerequisites

- **Python 3.12+**
- **Node.js 22+**
- **[uv](https://docs.astral.sh/uv/)** (Python package manager)

No database server required — SQLite is used by default.

### 1. Clone and install

```bash
git clone https://github.com/dmmeier/opportunity-solution-trees.git
cd opportunity-solution-trees

# Install Python dependencies
curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync --all-packages
```

### 2. Start the backend

```bash
uv run uvicorn ost_api.main:app --reload --port 8000
```

The API is now available at http://localhost:8000. Swagger docs at http://localhost:8000/docs.

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

### 4. (Optional) Enable AI chat

To use the AI coach and builder chat, provide your Anthropic API key. You can do this either way:

- **In the app**: Open the Settings dialog in the UI and enter your API key there
- **Via environment variable**: `export ANTHROPIC_API_KEY="sk-ant-..."` (requires backend restart)

The app works fully without this — you just won't have the AI chat features.

---

## Docker (Quick Start with PostgreSQL)

The Docker Compose setup runs a PostgreSQL database (not SQLite). Data is persisted in a Docker volume.

### Prerequisites

- Docker & Docker Compose
- Git

### 1. Configure

```bash
cp .env.docker.example .env
# Edit .env — add your Anthropic API key (optional) and change the DB password
```

### 2. Start

```bash
docker compose up -d
```

### 3. Access

- **Frontend**: http://localhost:3000
- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### Docker management

```bash
docker compose ps          # View running containers
docker compose logs -f     # Stream logs
docker compose down        # Stop everything
docker compose down -v     # Stop and delete database volume
docker compose up -d --build  # Rebuild after code changes
```

---

## CLI

The `ost` CLI gives you terminal access to all core operations:

```bash
uv run ost list                    # List all projects
uv run ost show <tree-id>         # Display a tree
uv run ost stats <tree-id>        # Tree statistics
uv run ost validate <tree-id>     # Run structural validation
uv run ost export <tree-id>       # Export tree as JSON
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///ost.db` | Database connection string |
| `ANTHROPIC_API_KEY` | *(none)* | Enables AI chat features |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |

### Using PostgreSQL

To use PostgreSQL instead of SQLite:

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/ost"
```

The application creates all tables automatically on first startup. No manual migration needed.

Requires `psycopg2-binary` which is already included in the project dependencies.

---

## Architecture

```
opportunity_solution_trees/
├── packages/
│   └── ost_core/              # Core Python library
│       └── src/ost_core/
│           ├── db/            # SQLAlchemy ORM, repository (closure table)
│           ├── models/        # Pydantic models
│           ├── services/      # Business logic (tree CRUD, move, snapshots)
│           ├── validation/    # Structural validation rules engine
│           └── llm/           # AI/LLM integration
├── services/
│   ├── api/                   # FastAPI REST API (port 8000)
│   └── cli/                   # Typer CLI tool
├── frontend/                  # Next.js web application
│   └── src/
│       ├── app/               # Next.js app router
│       ├── components/        # React components (tree, panels, chat)
│       ├── lib/               # API client, types, utilities
│       └── stores/            # Zustand state management
└── docs/                      # OST recipe, requirements
```

### Key Design Decisions

- **Closure table** for efficient ancestor/descendant queries on the tree structure
- **UV workspace monorepo** — `ost_core`, `api`, and `cli` are separate packages with shared dependencies
- **SQLite by default** — zero setup for local development. PostgreSQL supported for production deployments via the same SQLAlchemy ORM layer.

---

## API Reference

Once the backend is running, interactive docs are available at:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Key Endpoints

```
Projects
  POST   /api/v1/projects              Create project
  GET    /api/v1/projects              List projects
  GET    /api/v1/projects/{id}         Get project with trees

Trees
  POST   /api/v1/trees                 Create tree
  GET    /api/v1/trees/{id}            Get tree with all nodes
  GET    /api/v1/trees/{id}/export     Export tree (with styling metadata)
  POST   /api/v1/trees/import          Import tree from JSON

Nodes
  POST   /api/v1/nodes?tree_id=...     Add node
  PATCH  /api/v1/nodes/{id}            Update node
  POST   /api/v1/nodes/{id}/move       Move subtree to new parent

Validation
  POST   /api/v1/validation/{tree_id}/validate

Chat
  POST   /api/v1/chat                  AI chat (coach + builder modes)

Health
  GET    /health
```

---

## Testing

```bash
# Run all Python tests (267 tests)
uv run pytest

# Run with verbose output
uv run pytest -v

# TypeScript type checking
cd frontend && npx tsc --noEmit
```

---

## Troubleshooting

### Backend won't start

```bash
# Check Python version (need 3.12+)
python3 --version

# Reinstall dependencies
uv sync --all-packages

# Check if port 8000 is in use
lsof -i :8000
```

### Frontend won't build

```bash
# Check Node.js version (need 22+)
node --version

# Clean install
rm -rf frontend/node_modules frontend/.next
cd frontend && npm install && npm run dev
```

### Docker issues

```bash
# View logs for a specific service
docker compose logs backend

# Rebuild from scratch
docker compose down -v
docker compose up -d --build
```

---

## License

MIT

---

## Acknowledgments

Built on the [Opportunity Solution Tree](https://www.producttalk.org/opportunity-solution-tree/) framework by [Teresa Torres](https://www.producttalk.org/).

Uses [Claude](https://www.anthropic.com/claude) by Anthropic for AI coaching features.
