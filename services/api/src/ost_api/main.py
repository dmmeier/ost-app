"""FastAPI application entry point."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ost_api.routers import auth, chat, edges, git, members, nodes, projects, settings, tags, trees, validation

app = FastAPI(
    title="OST API",
    description="REST API for Opportunity Solution Trees",
    version="0.1.0",
)

# CORS origins: configurable via CORS_ORIGINS env var (comma-separated)
_default_origins = ["http://localhost:3000"]
_cors_origins = os.environ.get("CORS_ORIGINS", "").split(",") if os.environ.get("CORS_ORIGINS") else _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(projects.router, prefix="/api/v1/projects", tags=["projects"])
app.include_router(trees.router, prefix="/api/v1/trees", tags=["trees"])
app.include_router(nodes.router, prefix="/api/v1/nodes", tags=["nodes"])
app.include_router(edges.router, prefix="/api/v1/edges", tags=["edges"])
app.include_router(validation.router, prefix="/api/v1/validation", tags=["validation"])
app.include_router(chat.router, prefix="/api/v1/chat", tags=["chat"])
app.include_router(tags.router, prefix="/api/v1/tags", tags=["tags"])
app.include_router(settings.router, prefix="/api/v1/settings", tags=["settings"])
app.include_router(git.router, prefix="/api/v1/git", tags=["git"])
app.include_router(members.router, prefix="/api/v1", tags=["members"])


@app.get("/health")
def health_check():
    return {"status": "ok"}
