"""Anthropic/Claude LLM provider implementation."""

from typing import Any

import anthropic

from ost_core.llm.base import LLMProvider, LLMResponse, ToolCall, ToolDefinition


class AnthropicProvider(LLMProvider):
    """LLM provider using Anthropic's Claude API."""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    def _convert_tools(self, tools: list[ToolDefinition]) -> list[dict]:
        """Convert ToolDefinitions to Anthropic tool format."""
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.parameters,
            }
            for tool in tools
        ]

    def _convert_messages(self, messages: list[dict[str, Any]]) -> list[dict]:
        """Convert unified message format to Anthropic format."""
        anthropic_messages = []
        for msg in messages:
            role = msg["role"]
            if role == "tool_result":
                anthropic_messages.append({
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": msg["tool_use_id"],
                            "content": str(msg["content"]),
                        }
                    ],
                })
            elif role == "assistant" and "tool_calls" in msg:
                content = []
                if msg.get("text"):
                    content.append({"type": "text", "text": msg["text"]})
                for tc in msg["tool_calls"]:
                    content.append({
                        "type": "tool_use",
                        "id": tc["id"],
                        "name": tc["name"],
                        "input": tc["arguments"],
                    })
                anthropic_messages.append({"role": "assistant", "content": content})
            else:
                anthropic_messages.append({"role": role, "content": msg["content"]})
        return anthropic_messages

    async def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[ToolDefinition],
        system_prompt: str = "",
    ) -> LLMResponse:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": 4096,
            "messages": self._convert_messages(messages),
        }
        if system_prompt:
            kwargs["system"] = system_prompt
        if tools:
            kwargs["tools"] = self._convert_tools(tools)

        response = await self.client.messages.create(**kwargs)

        text_parts = []
        tool_calls = []

        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append(
                    ToolCall(id=block.id, name=block.name, arguments=block.input)
                )

        stop_reason = "end_turn"
        if response.stop_reason == "tool_use":
            stop_reason = "tool_use"
        elif response.stop_reason == "max_tokens":
            stop_reason = "max_tokens"

        return LLMResponse(
            text="\n".join(text_parts) if text_parts else None,
            tool_calls=tool_calls,
            stop_reason=stop_reason,
        )
