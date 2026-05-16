"""Settings endpoint for runtime configuration."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ost_core.config import get_runtime_overrides, get_settings, persist_to_env, set_runtime_override
from ost_core.models.user import User
from ost_api.deps import get_current_user_required

router = APIRouter()


class SettingsUpdate(BaseModel):
    llm_provider: str | None = None
    llm_model: str | None = None
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    google_api_key: str | None = None


class SettingsResponse(BaseModel):
    llm_provider: str
    llm_model: str
    has_anthropic_key: bool
    has_openai_key: bool
    has_google_key: bool
    available_providers: list[str]


@router.get("/", response_model=SettingsResponse)
def get_current_settings():
    settings = get_settings()
    overrides = get_runtime_overrides()

    provider = overrides.get("llm_provider") or settings.llm_provider
    model = overrides.get("llm_model") or settings.llm_model

    return SettingsResponse(
        llm_provider=provider,
        llm_model=model,
        has_anthropic_key=bool(overrides.get("anthropic_api_key") or settings.anthropic_api_key),
        has_openai_key=bool(overrides.get("openai_api_key") or settings.openai_api_key),
        has_google_key=bool(overrides.get("google_api_key") or settings.google_api_key),
        available_providers=["anthropic", "openai", "google"],
    )


@router.patch("/", response_model=SettingsResponse)
def update_settings(data: SettingsUpdate, _user: User | None = Depends(get_current_user_required)):
    if data.llm_provider is not None:
        persist_to_env("llm_provider", data.llm_provider)
    if data.llm_model is not None:
        persist_to_env("llm_model", data.llm_model)
    if data.anthropic_api_key is not None:
        persist_to_env("anthropic_api_key", data.anthropic_api_key)
    if data.openai_api_key is not None:
        persist_to_env("openai_api_key", data.openai_api_key)
    if data.google_api_key is not None:
        persist_to_env("google_api_key", data.google_api_key)

    return get_current_settings()
