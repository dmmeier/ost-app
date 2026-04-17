"""Google Gemini LLM provider implementation."""

from typing import Any

from google import genai
from google.genai import types

from ost_core.llm.base import LLMProvider, LLMResponse, ToolCall, ToolDefinition


class GoogleProvider(LLMProvider):
    """LLM provider using Google's Gemini API."""

    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self.client = genai.Client(api_key=api_key)
        self.model = model

    def _convert_tools(self, tools: list[ToolDefinition]) -> list[types.Tool]:
        """Convert ToolDefinitions to Gemini tool format."""
        declarations = []
        for tool in tools:
            # Strip unsupported fields from JSON Schema for Gemini
            params = dict(tool.parameters)
            params.pop("additionalProperties", None)
            declarations.append(
                types.FunctionDeclaration(
                    name=tool.name,
                    description=tool.description,
                    parameters=params,
                )
            )
        return [types.Tool(function_declarations=declarations)]

    def _convert_messages(self, messages: list[dict[str, Any]]) -> list[types.Content]:
        """Convert unified message format to Gemini format."""
        contents = []
        for msg in messages:
            role = msg["role"]
            if role == "tool_result":
                contents.append(
                    types.Content(
                        role="user",
                        parts=[
                            types.Part(
                                function_response=types.FunctionResponse(
                                    name=msg.get("tool_name", "unknown"),
                                    response={"result": str(msg["content"])},
                                )
                            )
                        ],
                    )
                )
            elif role == "assistant" and "tool_calls" in msg:
                parts = []
                if msg.get("text"):
                    parts.append(types.Part(text=msg["text"]))
                for tc in msg["tool_calls"]:
                    parts.append(
                        types.Part(
                            function_call=types.FunctionCall(
                                name=tc["name"], args=tc["arguments"]
                            )
                        )
                    )
                contents.append(types.Content(role="model", parts=parts))
            elif role == "assistant":
                contents.append(
                    types.Content(role="model", parts=[types.Part(text=msg["content"])])
                )
            else:
                contents.append(
                    types.Content(role="user", parts=[types.Part(text=msg["content"])])
                )
        return contents

    async def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[ToolDefinition],
        system_prompt: str = "",
    ) -> LLMResponse:
        config = types.GenerateContentConfig(
            system_instruction=system_prompt if system_prompt else None,
            tools=self._convert_tools(tools) if tools else None,
        )

        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=self._convert_messages(messages),
            config=config,
        )

        text_parts = []
        tool_calls = []

        if response.candidates and response.candidates[0].content:
            for part in response.candidates[0].content.parts:
                if part.text:
                    text_parts.append(part.text)
                elif part.function_call:
                    tool_calls.append(
                        ToolCall(
                            id=f"call_{part.function_call.name}_{len(tool_calls)}",
                            name=part.function_call.name,
                            arguments=dict(part.function_call.args) if part.function_call.args else {},
                        )
                    )

        stop_reason = "end_turn"
        if tool_calls:
            stop_reason = "tool_use"

        return LLMResponse(
            text="\n".join(text_parts) if text_parts else None,
            tool_calls=tool_calls,
            stop_reason=stop_reason,
        )
