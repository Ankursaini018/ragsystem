import { useState, useRef, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { streamChat, Citation, ChatMetadata } from "@/lib/rag-api";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  confidenceScore?: number;
  latencyMs?: number;
  isStreaming?: boolean;
}

export function RAGChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Create a new session on mount
  useEffect(() => {
    const createSession = async () => {
      const { data, error } = await supabase
        .from("chat_sessions")
        .insert({ title: "New Chat" })
        .select()
        .single();

      if (!error && data) {
        setSessionId(data.id);
      }
    };
    createSession();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(
    async (content: string) => {
      if (!sessionId) return;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      // Create placeholder for assistant message
      const assistantId = crypto.randomUUID();
      let assistantContent = "";
      let metadata: ChatMetadata | null = null;

      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          isStreaming: true,
        },
      ]);

      try {
        await streamChat(content, sessionId, {
          onMetadata: (meta) => {
            metadata = meta;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      citations: meta.citations,
                      confidenceScore: meta.confidenceScore,
                      latencyMs: meta.latencyMs,
                    }
                  : m
              )
            );
          },
          onDelta: (delta) => {
            assistantContent += delta;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: assistantContent } : m
              )
            );
          },
          onDone: () => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m
              )
            );
            setIsLoading(false);

            // Save messages to database
            if (metadata) {
              supabase
                .from("chat_messages")
                .insert([
                  { session_id: sessionId, role: "user", content },
                  {
                    session_id: sessionId,
                    role: "assistant",
                    content: assistantContent,
                    citations: JSON.parse(JSON.stringify(metadata.citations)),
                    confidence_score: metadata.confidenceScore,
                    latency_ms: metadata.latencyMs,
                  },
                ])
                .then(({ error }) => {
                  if (error) console.error("Failed to save messages:", error);
                });
            }
          },
          onError: (error) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: `Error: ${error}`,
                      isStreaming: false,
                    }
                  : m
              )
            );
            setIsLoading(false);
          },
        });
      } catch (error) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                  isStreaming: false,
                }
              : m
          )
        );
        setIsLoading(false);
      }
    },
    [sessionId]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        <div className="max-w-3xl mx-auto py-6 space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 glow-primary">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">
                <span className="text-gradient">RAG Assistant</span>
              </h2>
              <p className="text-muted-foreground max-w-md">
                Ask questions about your uploaded documents. I'll search through
                them and provide answers with citations.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 justify-center">
                {[
                  "What topics are covered in my documents?",
                  "Summarize the key points",
                  "Find information about...",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSend(suggestion)}
                    className="px-3 py-1.5 text-sm rounded-full bg-secondary hover:bg-secondary/80 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
                citations={message.citations}
                confidenceScore={message.confidenceScore}
                latencyMs={message.latencyMs}
                isStreaming={message.isStreaming}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="p-4 border-t border-border/50">
        <div className="max-w-3xl mx-auto">
          <ChatInput onSend={handleSend} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
