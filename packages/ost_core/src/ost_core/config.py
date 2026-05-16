"""Configuration settings for OST core."""

import os
import secrets
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///ost.db"
    log_level: str = "INFO"

    # LLM provider settings
    llm_provider: str = "anthropic"  # anthropic | openai | google
    llm_model: str = "claude-sonnet-4-20250514"

    # API keys (set via environment variables)
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""

    # JWT authentication
    jwt_secret: str = ""
    jwt_expiry_days: int = 7

    # Git export settings
    git_remote_url: str = ""
    git_branch: str = "main"
    git_token: str = ""
    user_name: str = ""
    user_email: str = ""

    model_config = {"env_prefix": "OST_", "env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    @property
    def resolved_git_token(self) -> str:
        """Return git token, falling back to GIT_TOKEN env var."""
        return self.git_token or os.environ.get("GIT_TOKEN", "")


# Runtime overrides (set via the settings API, take precedence over env vars)
_runtime_overrides: dict[str, str] = {}


def set_runtime_override(key: str, value: str) -> None:
    _runtime_overrides[key] = value


def get_runtime_override(key: str) -> str | None:
    return _runtime_overrides.get(key) or None


def get_runtime_overrides() -> dict[str, str]:
    return dict(_runtime_overrides)


def persist_to_env(key: str, value: str) -> None:
    """Write/update a key in the .env file and set as runtime override.

    Key is uppercased and prefixed with OST_ (e.g., 'llm_model' -> 'OST_LLM_MODEL').
    If the key already exists in .env, the line is replaced; otherwise it's appended.
    """
    env_key = f"OST_{key.upper()}"
    env_path = Path(".env")

    # Also set runtime override for immediate effect
    set_runtime_override(key, value)

    # Also set in os.environ so Settings() picks it up
    os.environ[env_key] = value

    if env_path.exists():
        lines = env_path.read_text().splitlines()
        found = False
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith(f"{env_key}=") or stripped.startswith(f"{env_key} ="):
                lines[i] = f"{env_key}={value}"
                found = True
                break
        if found:
            env_path.write_text("\n".join(lines) + "\n")
        else:
            with open(env_path, "a") as f:
                f.write(f"{env_key}={value}\n")
    else:
        with open(env_path, "w") as f:
            f.write(f"{env_key}={value}\n")


_jwt_secret_ensured = False


def _ensure_jwt_secret() -> None:
    """Auto-generate OST_JWT_SECRET if not configured.

    Generates a random secret via secrets.token_hex(32) and appends it to .env
    so that registration/login works out of the box on fresh installs.
    """
    global _jwt_secret_ensured
    if _jwt_secret_ensured:
        return
    _jwt_secret_ensured = True

    if os.environ.get("OST_JWT_SECRET"):
        return

    # Check if .env already has the key
    env_path = Path(".env")
    if env_path.exists():
        content = env_path.read_text()
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("OST_JWT_SECRET=") and len(stripped) > len("OST_JWT_SECRET="):
                return

    # Generate and persist
    secret = secrets.token_hex(32)
    os.environ["OST_JWT_SECRET"] = secret
    with open(env_path, "a") as f:
        f.write(f"\nOST_JWT_SECRET={secret}\n")


def get_settings() -> Settings:
    _ensure_jwt_secret()
    return Settings()
