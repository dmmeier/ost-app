"""OpenAI/GPT LLM provider implementation."""

import json
from typing import Any

import openai

from ost_core.llm.base import LLMProvider, LLMResponse, ToolCall, ToolDefinition


class OpenAIProvider(LLMProvider):
    """LLM provider using OpenAI's GPT API."""

    def __init__(self, api_key: str, model: str = "gpt-4o"):
        self.client = openai.AsyncOpenAI(api_key=api_key)
        self.model = model

    def _convert_tools(self, tools: list[ToolDefinition]) -> list[dict]:
        """Convert ToolDefinitions to OpenAI function calling format."""
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                },
            }
            for tool in tools
        ]

    def _convert_messages(self, messages: list[dict[str, Any]], system_prompt: str) -> list[dict]:
        """Convert unified message format to OpenAI format."""
        oai_messages = []
        if system_prompt:
            oai_messages.append({"role": "system", "content": system_prompt})
        for msg in messages:
            role = msg["role"]
            if role == "tool_result":
                oai_messages.append({
                    "role": "tool",
                    "tool_call_id": msg["tool_use_id"],
                    "content": str(msg["content"]),
                })
            elif role == "assistant" and "tool_calls" in msg:
                tool_calls = [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": json.dumps(tc["arguments"]),
                        },
                    }
                    for tc in msg["tool_calls"]
                ]
                oai_messages.append({
                    "role": "assistant",
                    "content": msg.get("text") or None,
                    "tool_calls": tool_calls,
                })
            else:
                oai_messages.append({"role": role, "content": msg["content"]})
        return oai_messages

    async def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[ToolDefinition],
        system_prompt: str = "",
    ) -> LLMResponse:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": self._convert_messages(messages, system_prompt),
        }
        if tools:
            kwargs["tools"] = self._convert_tools(tools)

        response = await self.client.chat.completions.create(**kwargs)

        choice = response.choices[0]
        text = choice.message.content
        tool_calls = []

        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                tool_calls.append(
                    ToolCall(
                        id=tc.id,
                        name=tc.function.name,
                        arguments=json.loads(tc.function.arguments),
                    )
                )

        stop_reason = "end_turn"
        if choice.finish_reason == "tool_calls":
            stop_reason = "tool_use"
        elif choice.finish_reason == "length":
            stop_reason = "max_tokens"

        return LLMResponse(text=text, tool_calls=tool_calls, stop_reason=stop_reason)
