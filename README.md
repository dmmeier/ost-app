# Opportunity Solution Tree (OST) Application

A full-stack web application for building, managing, and collaborating on Opportunity Solution Trees using Teresa Torres' Continuous Discovery framework.

## Features

- **Visual Tree Builder**: Interactive canvas for creating OST structures
- **AI-Powered Coach**: Chat interface with AI guidance for product discovery
- **Version Control**: Snapshot and restore tree states
- **Team Collaboration**: Multi-user support with shared projects
- **Validation Engine**: Built-in structural validation for OST best practices
- **Multiple Interfaces**: Web UI, REST API, and CLI

## Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy, PostgreSQL
- **Frontend**: Next.js 16, React 19, ReactFlow, TanStack Query
- **Database**: PostgreSQL 16 (SQLite for local development)
- **AI**: Anthropic Claude API

---

## Installation

### Prerequisites

- Docker & Docker Compose
- Git
- Anthropic API key ([get one here](https://console.anthropic.com/))

### Quick Start with Docker (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd opportunity_solution_trees
   ```

2. **Configure environment variables**
   ```bash
   cp .env.docker.example .env
   nano .env  # Add your Anthropic API key
   ```

3. **Start the application**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### Management Commands

```bash
# View running containers
docker-compose ps

# View logs
docker-compose logs -f

# Stop the application
docker-compose down

# Restart a service
docker-compose restart backend

# Update to latest version
git pull
docker-compose up -d --build
```

---

## Local Development (Without Docker)

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16+ (or use SQLite for testing)

### Backend Setup

```bash
# Install Python dependencies
curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync

# Set environment variables
export DATABASE_URL="postgresql://user:pass@localhost:5432/ost"
export ANTHROPIC_API_KEY="your-key-here"

# Start backend server
uv run uvicorn ost_api.main:app --reload --port 8000
```

### Frontend Setup

```bash
# Install Node.js dependencies
cd frontend
npm install

# Start frontend dev server
npm run dev
```

### CLI Usage

```bash
# List all projects
uv run ost list

# Show a tree
uv run ost show <tree-id>

# Validate a tree
uv run ost validate <tree-id>

# Export a tree
uv run ost export <tree-id> > tree.json
```

---

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Database connection (PostgreSQL recommended for production)
DATABASE_URL=postgresql://user:password@host:5432/database

# Or use SQLite for local development
DATABASE_URL=sqlite:///ost.db

# Anthropic API key (required for AI chat features)
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

### Database Migration

The application automatically creates tables on first startup. To switch from SQLite to PostgreSQL:

1. Set `DATABASE_URL` to your PostgreSQL connection string
2. Restart the backend
3. Tables will be created automatically

---

## Architecture

```
opportunity_solution_trees/
├── packages/
│   └── ost_core/           # Core Python library
│       ├── db/             # SQLAlchemy models & repository
│       ├── services/       # Business logic
│       ├── validation/     # OST validation engine
│       └── llm/            # AI integration
├── services/
│   ├── api/                # FastAPI REST API
│   └── cli/                # Typer CLI tool
├── frontend/               # Next.js web application
│   ├── src/
│   │   ├── app/            # Next.js app router
│   │   ├── components/     # React components
│   │   ├── lib/            # API client & utilities
│   │   └── stores/         # Zustand state management
│   └── public/
└── docs/                   # Documentation
```

---

## API Documentation

Once the backend is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Key Endpoints

```
GET    /api/v1/projects              # List all projects
POST   /api/v1/projects              # Create project
GET    /api/v1/projects/{id}/trees   # List trees in project
POST   /api/v1/trees                 # Create tree
GET    /api/v1/trees/{id}            # Get tree with nodes
POST   /api/v1/nodes                 # Add node to tree
PATCH  /api/v1/nodes/{id}            # Update node
POST   /api/v1/validation/{tree_id}  # Validate tree structure
POST   /api/v1/chat                  # AI chat endpoint
```

---

## Deployment

### Docker Deployment (Production)

1. **Update passwords** in `docker-compose.yml`:
   ```yaml
   POSTGRES_PASSWORD: your-secure-password
   ```

2. **Add authentication** (recommended):
   - Use nginx reverse proxy with basic auth
   - Or integrate with company SSO

3. **Enable HTTPS**:
   - Add nginx with SSL certificates
   - Update CORS settings in backend

4. **Set up backups**:
   ```bash
   # Backup PostgreSQL volume
   docker-compose exec postgres pg_dump -U ost_user ost > backup.sql
   ```

### Resource Requirements

- **Minimum**: 512 MB RAM, 2 GB disk
- **Recommended**: 1 GB RAM, 5 GB disk
- **CPU**: 1 core sufficient for small teams (<10 users)

### Scaling

- Backend and frontend can be scaled horizontally
- PostgreSQL can be moved to managed service (AWS RDS, etc.)
- Add Redis for session management at scale

---

## Troubleshooting

### Backend won't start

```bash
# Check logs
docker-compose logs backend

# Common issues:
# - DATABASE_URL not set
# - PostgreSQL not ready (wait 10s and retry)
# - Port 8000 already in use
```

### Frontend won't build

```bash
# Check Node.js version
node --version  # Should be 20+

# Clear cache and rebuild
rm -rf frontend/node_modules frontend/.next
npm install
npm run build
```

### Database connection errors

```bash
# Test PostgreSQL connection
docker-compose exec postgres psql -U ost_user -d ost

# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d
```

### "ModuleNotFoundError" errors

```bash
# Reinstall Python packages
uv sync --all-packages

# Rebuild Docker containers
docker-compose build --no-cache
```

---

## Testing

### Run Python tests
```bash
uv run pytest -v
```

### Run TypeScript type checking
```bash
cd frontend
npx tsc --noEmit
```

---

## Contributing

### Code Structure

- **Backend**: Python 3.12, follows PEP 8
- **Frontend**: TypeScript, React functional components
- **Database**: SQLAlchemy ORM, migrations via startup hooks

### Adding Features

1. Update backend models/services in `packages/ost_core`
2. Add API endpoints in `services/api/routers`
3. Update frontend components in `frontend/src/components`
4. Add tests in respective `tests/` directories

---

## License

[Your License Here]

---

## Support

For issues, questions, or feature requests:
- Open an issue in the repository
- Check the documentation in `docs/`
- Review API documentation at `/docs` endpoint

---

## Acknowledgments

Built on the Opportunity Solution Tree framework by Teresa Torres.
Uses Claude AI by Anthropic for intelligent coaching features.
