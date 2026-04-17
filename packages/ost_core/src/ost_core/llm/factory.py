"""LLM provider factory -- creates the right provider based on config."""

from ost_core.config import get_runtime_override, get_settings
from ost_core.llm.base import LLMProvider


def get_llm_provider(provider_name: str | None = None) -> LLMProvider:
    """Create an LLM provider instance based on config.

    Args:
        provider_name: Override provider (anthropic, openai, google).
                      If None, uses runtime override or config default.
    """
    settings = get_settings()
    name = provider_name or get_runtime_override("llm_provider") or settings.llm_provider
    model = get_runtime_override("llm_model") or settings.llm_model

    if name == "anthropic":
        from ost_core.llm.anthropic import AnthropicProvider
        api_key = get_runtime_override("anthropic_api_key") or settings.anthropic_api_key
        if not api_key:
            raise ValueError("Anthropic API key not set. Configure it in Settings or set OST_ANTHROPIC_API_KEY.")
        return AnthropicProvider(api_key=api_key, model=model if "claude" in model else "claude-sonnet-4-20250514")

    elif name == "openai":
        from ost_core.llm.openai import OpenAIProvider
        api_key = get_runtime_override("openai_api_key") or settings.openai_api_key
        if not api_key:
            raise ValueError("OpenAI API key not set. Configure it in Settings or set OST_OPENAI_API_KEY.")
        return OpenAIProvider(api_key=api_key, model=model if "gpt" in model else "gpt-4o")

    elif name == "google":
        from ost_core.llm.google import GoogleProvider
        api_key = get_runtime_override("google_api_key") or settings.google_api_key
        if not api_key:
            raise ValueError("Google API key not set. Configure it in Settings or set OST_GOOGLE_API_KEY.")
        return GoogleProvider(api_key=api_key, model=model if "gemini" in model else "gemini-2.0-flash")

    else:
        raise ValueError(f"Unknown LLM provider: {name}. Use 'anthropic', 'openai', or 'google'.")
