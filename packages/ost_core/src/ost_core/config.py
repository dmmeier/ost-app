"""Configuration settings for OST core."""

import os

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

    # Git export settings
    git_remote_url: str = ""
    git_branch: str = "main"
    git_token: str = ""
    user_name: str = ""
    user_email: str = ""

    model_config = {"env_prefix": "OST_"}

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


def get_settings() -> Settings:
    return Settings()
