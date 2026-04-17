"""Abstract LLM provider interface and shared types."""

from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel


class ToolDefinition(BaseModel):
    """A tool that the LLM can call."""
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema for the parameters


class ToolCall(BaseModel):
    """A tool call made by the LLM."""
    id: str
    name: str
    arguments: dict[str, Any]


class LLMResponse(BaseModel):
    """Response from an LLM provider."""
    text: str | None = None
    tool_calls: list[ToolCall] = []
    stop_reason: str = "end_turn"  # end_turn, tool_use, max_tokens


class LLMProvider(ABC):
    """Abstract interface for LLM providers."""

    @abstractmethod
    async def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[ToolDefinition],
        system_prompt: str = "",
    ) -> LLMResponse:
        """Send messages to the LLM with tool definitions.

        Args:
            messages: List of message dicts with "role" and "content" keys.
                     Roles: "user", "assistant", "tool_result"
            tools: List of available tool definitions.
            system_prompt: System instructions for the LLM.

        Returns:
            LLMResponse with text and/or tool calls.
        """
        ...
