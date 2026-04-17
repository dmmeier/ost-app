"""Feedback endpoint — writes user feedback to .feedback/ directory."""

import base64
from datetime import datetime, UTC
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

FEEDBACK_DIR = Path(__file__).resolve().parents[5] / ".feedback"


class FeedbackRequest(BaseModel):
    text: str
    screenshot: str | None = None  # base64 data URL
    url: str | None = None
    timestamp: str | None = None


@router.post("/", status_code=201)
def submit_feedback(request: FeedbackRequest):
    """Save user feedback to .feedback/ directory for Claude Code to process."""
    FEEDBACK_DIR.mkdir(exist_ok=True)

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")

    # Write markdown feedback file
    md_path = FEEDBACK_DIR / f"{ts}.md"
    content = f"# Feedback — {ts}\n\n"
    if request.url:
        content += f"**URL:** {request.url}\n\n"
    if request.timestamp:
        content += f"**Submitted:** {request.timestamp}\n\n"
    content += f"## Feedback\n\n{request.text}\n"
    if request.screenshot:
        content += f"\n## Screenshot\n\nSee `{ts}.png`\n"

    md_path.write_text(content)

    # Write screenshot if provided
    if request.screenshot and request.screenshot.startswith("data:image/png;base64,"):
        png_data = base64.b64decode(request.screenshot.split(",", 1)[1])
        png_path = FEEDBACK_DIR / f"{ts}.png"
        png_path.write_bytes(png_data)

    return {"status": "received", "id": ts}
