# Version Pinning

All dependencies are pinned to exact versions to ensure reproducible builds and avoid dependency conflicts.

## Docker Base Images

| Image | Version | Notes |
|-------|---------|-------|
| Python | 3.12.8-slim | Backend runtime |
| Node.js | 20.18.3-alpine | Frontend build & runtime |
| PostgreSQL | 16.7-alpine | Database |

## Python Dependencies

### Core Library (ost_core)

| Package | Version | Purpose |
|---------|---------|---------|
| anthropic | 0.84.0 | Claude AI API client |
| google-genai | 1.65.0 | Gemini API client |
| openai | 2.24.0 | OpenAI API client |
| pydantic | 2.12.5 | Data validation |
| pydantic-settings | 2.13.1 | Settings management |
| sqlalchemy | 2.0.47 | ORM & database toolkit |
| psycopg2-binary | 2.9.11 | PostgreSQL driver |
| typer | 0.24.1 | CLI framework |
| rich | 14.3.3 | Terminal formatting |

### API Service (ost_api)

| Package | Version | Purpose |
|---------|---------|---------|
| fastapi | 0.133.1 | Web framework |
| uvicorn[standard] | 0.41.0 | ASGI server |
| python-multipart | 0.0.20 | Form data parsing |

### Development Tools

| Package | Version | Purpose |
|---------|---------|---------|
| pytest | 8.3.4 | Testing framework |
| pytest-cov | 6.0.0 | Coverage reporting |
| ruff | 0.9.1 | Linter & formatter |

## Node.js Dependencies

All Node.js packages are locked via `package-lock.json` (committed to repository).

Key packages:
- Next.js: 16.1.6
- React: 19.0.0
- @tanstack/react-query: 5.90.21
- reactflow: 11.11.4

## Lock Files

| File | Purpose | Status |
|------|---------|--------|
| `uv.lock` | Python dependency lock | ✅ Committed |
| `package-lock.json` | Node.js dependency lock | ✅ Committed |

## Updating Versions

### Python Packages

```bash
# Update a specific package
uv add "package-name==new.version"

# Update all packages (be careful!)
uv sync --upgrade

# After updating, commit uv.lock
git add uv.lock pyproject.toml
git commit -m "Update Python dependencies"
```

### Node.js Packages

```bash
cd frontend

# Update a specific package
npm install package-name@new.version

# Update all packages (be careful!)
npm update

# After updating, commit package-lock.json
git add package.json package-lock.json
git commit -m "Update Node.js dependencies"
```

### Docker Base Images

Update version numbers in Dockerfiles and docker-compose.yml, then rebuild:

```bash
# Update Dockerfile.backend, Dockerfile.frontend, docker-compose.yml
git add Dockerfile.* docker-compose.yml
git commit -m "Update Docker base images"

# Rebuild containers
docker compose build --no-cache
```

## Security Updates

Monitor for security vulnerabilities:

```bash
# Python
uv pip list --outdated

# Node.js
cd frontend && npm audit

# Docker images
docker scout cves <image-name>
```

## Version Strategy

- **Docker images**: Pin to patch version (e.g., `3.12.8-slim`)
- **Python packages**: Pin to exact version (e.g., `==2.0.47`)
- **Node packages**: Locked via package-lock.json
- **Update cadence**: Review quarterly or when security issues arise

## Current Snapshot (2025-04-16)

This document reflects the exact versions used as of April 16, 2025.
All builds using these versions are tested and known to work.
