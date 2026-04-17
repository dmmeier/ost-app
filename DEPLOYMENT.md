# OST App - Docker Deployment Guide

## Prerequisites

- Docker installed and running
- Docker Compose installed
- User in `docker` group (can run `docker ps` without sudo)

## Quick Start

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd opportunity_solution_trees
```

### 2. Set up environment variables
```bash
cp .env.docker.example .env
nano .env  # Edit and add your Anthropic API key
```

### 3. Start the application
```bash
docker-compose up -d
```

That's it! The app will be running at:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **PostgreSQL:** localhost:5432

### 4. Check status
```bash
docker-compose ps
docker-compose logs -f  # Follow logs
```

## Management Commands

### Stop the application
```bash
docker-compose down
```

### Stop and remove data (fresh start)
```bash
docker-compose down -v
```

### Restart a service
```bash
docker-compose restart backend
docker-compose restart frontend
```

### View logs
```bash
docker-compose logs backend
docker-compose logs frontend
docker-compose logs postgres
```

### Update the application
```bash
git pull
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Access PostgreSQL directly
```bash
docker-compose exec postgres psql -U ost_user -d ost
```

## Troubleshooting

### Container won't start
```bash
docker-compose logs <service-name>
```

### PostgreSQL connection issues
```bash
docker-compose exec postgres pg_isready -U ost_user
```

### Reset everything
```bash
docker-compose down -v
docker system prune -a
docker-compose up -d --build
```

## Production Considerations

1. **Change default passwords** in `docker-compose.yml`
2. **Add authentication** (nginx basic auth or company SSO)
3. **Enable HTTPS** (nginx reverse proxy with SSL)
4. **Set up backups** for PostgreSQL volume
5. **Monitor resource usage**

## Resource Usage

- PostgreSQL: ~50-100 MB RAM
- Backend: ~200-300 MB RAM
- Frontend: ~100-150 MB RAM
- **Total:** ~400-550 MB RAM

## Ports Used

- 3000: Frontend (Next.js)
- 8000: Backend (FastAPI)
- 5432: PostgreSQL

Make sure these ports are available or change them in `docker-compose.yml`.
