"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ChatMessage } from "@/lib/api-client";
import { useTreeStore } from "@/stores/tree-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ToolActivityIndicator } from "./ToolActivityIndicator";

interface ActiveTool {
  name: string;
  label: string;
}

interface ChatPanelProps {
  treeId: string;
  projectId: string;
}

interface DisplayMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: { name: string; id: string }[];
}

export function ChatPanel({ treeId, projectId }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  // The last system prompt returned by the API (shown in expanded view)
  const [lastSystemPrompt, setLastSystemPrompt] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamAbortRef = useRef<{ abort: () => void } | null>(null);
  const toolEndTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const queryClient = useQueryClient();
  const { chatMode, setChatMode, chatInitialMessage, setChatInitialMessage, setChatPanelOpen } = useTreeStore();

  // Cleanup: abort stream and clear timers on unmount
  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      for (const timer of toolEndTimersRef.current) {
        clearTimeout(timer);
      }
      toolEndTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, debugMode]);

  // Load chat history when tree changes
  useEffect(() => {
    setHistoryLoaded(false);
    setDisplayMessages([]);
    setConversationHistory([]);
    setLastSystemPrompt(null);

    api.chatHistory.get(treeId).then((history) => {
      if (history.length > 0) {
        const display: DisplayMessage[] = [];
        const conversation: ChatMessage[] = [];

        for (const msg of history) {
          if (msg.role === "user") {
            display.push({ role: "user", content: msg.content });
            conversation.push({ role: "user", content: msg.content });
          } else if (msg.role === "assistant") {
            const toolCalls = msg.tool_calls
              ? msg.tool_calls.map((tc: any, i: number) => ({ name: tc.name, id: String(i) }))
              : undefined;
            display.push({
              role: "assistant",
              content: msg.content,
              toolCalls,
            });
            if (msg.tool_calls) {
              conversation.push({
                role: "assistant",
                tool_calls: msg.tool_calls,
                text: msg.content,
              });
            } else {
              conversation.push({ role: "assistant", content: msg.content });
            }
          } else if (msg.role === "tool_result") {
            conversation.push({
              role: "tool_result",
              tool_use_id: msg.tool_use_id,
              tool_name: msg.tool_name,
              content: msg.content,
            });
          }
        }

        setDisplayMessages(display);
        setConversationHistory(conversation);
      }
      setHistoryLoaded(true);
    }).catch(() => {
      setHistoryLoaded(true);
    });
  }, [treeId]);

  const handleStreamResponse = useCallback((
    finalText: string,
    messages: ChatMessage[],
    collectedToolNames: string[],
  ) => {
    const assistantDisplay: DisplayMessage = {
      role: "assistant",
      content: finalText,
    };
    if (collectedToolNames.length > 0) {
      assistantDisplay.toolCalls = collectedToolNames.map((name, i) => ({ name, id: String(i) }));
    }
    setDisplayMessages((prev) => [...prev, assistantDisplay]);
    setConversationHistory(messages);

    // Refresh the tree visualization, sidebar, and project-level data
    queryClient.invalidateQueries({ queryKey: ["tree", treeId] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["project"] });
    queryClient.invalidateQueries({ queryKey: ["bubbleDefaults", projectId] });
    queryClient.invalidateQueries({ queryKey: ["projectTags", projectId] });
  }, [queryClient, treeId, projectId]);

  const handleSend = async (overrideMessage?: string) => {
    const userMessage = overrideMessage ?? input.trim();
    if (!userMessage || isLoading) return;

    if (!overrideMessage) setInput("");
    setIsLoading(true);
    setActiveTools([]);

    // Add user message to display
    setDisplayMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    // Build messages for API
    const newMessages: ChatMessage[] = [
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    // Collect tool names during streaming for the final badge display
    const collectedToolNames: string[] = [];
    let toolCallCounter = 0;

    // Clear any pending tool-end timers from a previous send
    for (const timer of toolEndTimersRef.current) {
      clearTimeout(timer);
    }
    toolEndTimersRef.current.clear();

    try {
      // Try streaming endpoint first
      const handle = api.chat.sendStream(
        treeId,
        newMessages,
        {
          onToolStart: (name: string, label: string) => {
            collectedToolNames.push(name);
            const instanceId = `${name}_${toolCallCounter++}`;
            setActiveTools((prev) => [...prev, { name: instanceId, label }]);
          },
          onToolEnd: (name: string) => {
            // Remove the oldest instance of this tool after a short delay
            const timer = setTimeout(() => {
              setActiveTools((prev) => {
                const idx = prev.findIndex((t) => t.name.startsWith(`${name}_`));
                if (idx === -1) return prev;
                return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
              });
              toolEndTimersRef.current.delete(timer);
            }, 800);
            toolEndTimersRef.current.add(timer);
          },
          onDone: (finalText: string, messages: ChatMessage[], systemPrompt?: string) => {
            setActiveTools([]);
            if (systemPrompt) setLastSystemPrompt(systemPrompt);
            handleStreamResponse(finalText, messages, collectedToolNames);
            setIsLoading(false);
            streamAbortRef.current = null;
          },
          onError: (message: string) => {
            setActiveTools([]);
            setIsLoading(false);
            streamAbortRef.current = null;

            const errorContent = `Error: ${message}`;
            setDisplayMessages((prev) => [
              ...prev,
              { role: "assistant", content: errorContent },
            ]);
            api.chatHistory.save(treeId, [
              { role: "user", content: userMessage },
              { role: "assistant", content: errorContent },
            ], chatMode).catch(() => {});
          },
        },
        undefined,
        chatMode,
      );

      streamAbortRef.current = handle;
    } catch {
      // Fallback to non-streaming endpoint
      try {
        const response = await api.chat.send(treeId, newMessages, undefined, chatMode);

        if (response.system_prompt) {
          setLastSystemPrompt(response.system_prompt);
        }

        const toolNames: string[] = [];
        for (const msg of response.messages) {
          if (msg.tool_calls) {
            for (const tc of msg.tool_calls) {
              toolNames.push(tc.name);
            }
          }
        }

        handleStreamResponse(response.final_text, response.messages, toolNames);
      } catch (error) {
        const errorContent = `Error: ${error instanceof Error ? error.message : "Failed to get response"}`;
        setDisplayMessages((prev) => [
          ...prev,
          { role: "assistant", content: errorContent },
        ]);
        api.chatHistory.save(treeId, [
          { role: "user", content: userMessage },
          { role: "assistant", content: errorContent },
        ], chatMode).catch(() => {});
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Auto-send contextual initial message (from "Chat about this" buttons)
  useEffect(() => {
    if (chatInitialMessage && historyLoaded && !isLoading) {
      const msg = chatInitialMessage;
      setChatInitialMessage(null);
      handleSend(msg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatInitialMessage, historyLoaded, isLoading]);

  const [confirmClear, setConfirmClear] = useState(false);
  const handleClearHistory = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    // Always clear local state (even if the API call fails)
    setDisplayMessages([]);
    setConversationHistory([]);
    setLastSystemPrompt(null);
    setConfirmClear(false);
    try {
      await api.chatHistory.clear(treeId);
    } catch (err) {
      console.error("Failed to clear chat history on server:", err);
    }
  };

  const startBuilderMode = () => {
    setChatMode("builder");
    setDisplayMessages([]);
    setConversationHistory([]);
    setLastSystemPrompt(null);
    handleSend("I want to build an Opportunity Solution Tree from scratch. Let's start!");
  };

  const exitBuilderMode = () => {
    setChatMode("coach");
  };

  // Render a single raw message block for the expanded view
  const renderRawMessage = (msg: ChatMessage, idx: number) => {
    if (msg.role === "user") {
      return (
        <div key={idx} className="rounded border border-[#0d9488]/30 bg-[#e6f4f3] p-2">
          <p className="text-[9px] font-bold text-[#0b7a70] uppercase mb-1">User</p>
          <pre className="text-[10px] text-ink whitespace-pre-wrap font-mono leading-tight">
            {msg.content}
          </pre>
        </div>
      );
    }

    if (msg.role === "assistant") {
      return (
        <div key={idx} className="rounded border border-green-200 bg-green-50 p-2">
          <p className="text-[9px] font-bold text-green-600 uppercase mb-1">Assistant</p>
          {msg.text && (
            <pre className="text-[10px] text-green-900 whitespace-pre-wrap font-mono leading-tight mb-1">
              {msg.text}
            </pre>
          )}
          {msg.content && !msg.tool_calls && (
            <pre className="text-[10px] text-green-900 whitespace-pre-wrap font-mono leading-tight">
              {msg.content}
            </pre>
          )}
          {msg.tool_calls && msg.tool_calls.length > 0 && (
            <div className="space-y-1 mt-1">
              {msg.tool_calls.map((tc, tcIdx) => (
                <div key={tcIdx} className="rounded bg-green-100 p-1.5">
                  <p className="text-[9px] font-bold text-green-700">
                    Tool Call: {tc.name}
                  </p>
                  <pre className="text-[9px] text-green-800 whitespace-pre-wrap font-mono leading-tight mt-0.5">
                    {JSON.stringify(tc.arguments, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (msg.role === "tool_result") {
      let displayContent = msg.content || "";
      try {
        const parsed = JSON.parse(displayContent);
        displayContent = JSON.stringify(parsed, null, 2);
      } catch {
        // Not JSON, show as-is
      }
      return (
        <div key={idx} className="rounded border border-orange-200 bg-orange-50 p-2">
          <p className="text-[9px] font-bold text-orange-600 uppercase mb-1">
            Tool Result: {msg.tool_name}
          </p>
          <pre className="text-[9px] text-orange-900 whitespace-pre-wrap font-mono leading-tight max-h-40 overflow-y-auto">
            {displayContent}
          </pre>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Chat header with collapse button */}
      <div className="flex items-center justify-between px-3 py-1.5 shrink-0" style={{ borderBottom: '1px solid var(--ost-line)', background: 'var(--ost-sidebar)' }}>
        <button
          onClick={() => setChatPanelOpen(false)}
          className="p-0.5 transition-colors"
          style={{ color: 'var(--ost-muted)' }}
          title="Collapse chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--ost-muted)', fontFamily: 'var(--font-ost-mono)' }}>Chat</span>
      </div>

      {/* Builder mode banner */}
      {chatMode === "builder" && (
        <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-amber-200">
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px]">
              Builder Mode
            </Badge>
            <span className="text-xs text-amber-700">Guided step-by-step OST construction</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-6 text-amber-700 hover:text-amber-900"
            onClick={exitBuilderMode}
          >
            Exit
          </Button>
        </div>
      )}

      {/* Debug mode toggle */}
      <div className="flex items-center justify-end px-3 py-1 border-b">
        <label className="flex items-center gap-1.5 text-[10px] text-faint cursor-pointer">
          <input
            type="checkbox"
            checked={debugMode}
            onChange={(e) => setDebugMode(e.target.checked)}
            className="rounded"
          />
          Expanded view
        </label>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0 p-4">
        <div className="space-y-4">
          {displayMessages.length === 0 && historyLoaded && !debugMode && (
            <div className="text-center text-faint text-sm mt-8 space-y-3">
              <p className="font-medium">
                {chatMode === "builder" ? "OST Builder" : "OST Coach"}
              </p>
              <p>
                {chatMode === "builder"
                  ? "I'll guide you through building an OST step by step."
                  : "Tell me about opportunities you've discovered or solutions you're considering."}
              </p>
              <p className="text-xs">
                {chatMode === "builder"
                  ? "We'll start by defining your outcome, then explore opportunities, solutions, and experiments."
                  : 'Example: "I\'ve spotted an opportunity: users forget their passwords"'}
              </p>
              {chatMode === "coach" && (
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-amber-600 border-amber-300 hover:bg-amber-50"
                    onClick={startBuilderMode}
                  >
                    Start Building an OST
                  </Button>
                </div>
              )}
            </div>
          )}

          {!debugMode ? (
            /* Normal view — compact display messages */
            <>
              {displayMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-[#0d9488] text-white"
                        : ""
                    }`}
                    style={msg.role === "user" ? undefined : { background: 'var(--ost-chip)', color: 'var(--ost-ink)' }}
                  >
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {msg.toolCalls.map((tc) => (
                          <Badge key={tc.id} variant="outline" className="text-[10px] bg-paper/80">
                            {tc.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            /* Expanded view — shows exactly what the LLM sees */
            <div className="space-y-2">
              {/* System prompt */}
              {lastSystemPrompt ? (
                <details className="rounded border border-purple-200 bg-purple-50">
                  <summary className="text-[9px] font-bold text-purple-600 uppercase p-2 cursor-pointer select-none">
                    System Prompt ({lastSystemPrompt.length} chars)
                  </summary>
                  <pre className="text-[10px] text-purple-900 whitespace-pre-wrap font-mono leading-tight p-2 pt-0 max-h-[50vh] overflow-y-auto">
                    {lastSystemPrompt}
                  </pre>
                </details>
              ) : (
                <div className="rounded border border-purple-200 bg-purple-50 p-2">
                  <p className="text-[9px] text-purple-500 italic">
                    System prompt not yet available. Send a message to capture it.
                  </p>
                </div>
              )}

              {/* Separator */}
              <div className="text-[9px] text-faint uppercase font-bold px-1">
                Messages ({conversationHistory.length})
              </div>

              {/* Full conversation history — exactly what gets sent to the LLM */}
              {conversationHistory.length === 0 ? (
                <p className="text-[10px] text-faint italic px-1">No messages yet.</p>
              ) : (
                conversationHistory.map((msg, idx) => renderRawMessage(msg, idx))
              )}
            </div>
          )}

          <ToolActivityIndicator activeTools={activeTools} isLoading={isLoading} />

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-3 space-y-2">
        <Textarea
          placeholder={
            chatMode === "builder"
              ? "Answer the coach's question..."
              : "Describe an opportunity, solution, or ask for advice..."
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          className="resize-none text-sm"
        />
        <div className="flex justify-between items-center">
          {displayMessages.length > 0 && (
            <button
              onClick={handleClearHistory}
              className={`text-xs transition-colors ${
                confirmClear
                  ? "text-red-600 font-medium"
                  : "text-faint hover:text-red-500"
              }`}
            >
              {confirmClear ? "Click again to confirm" : "Clear history"}
            </button>
          )}
          <div className="flex-1" />
          <Button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            size="sm"
            className="bg-[#0d9488] hover:bg-[#0b7a70] text-white"
          >
            {isLoading ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
