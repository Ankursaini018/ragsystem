import { useState, useRef, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { sendChat, Citation } from "@/lib/rag-api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, FileText } from "lucide-react";

interface RAGChatProps {
  selectedDocumentId: string;
  onSelectedDocumentChange: (id: string) => void;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  confidenceScore?: number;
  latencyMs?: number;
}

export function RAGChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<{ id: string; title: string }[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("all");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    const createSession = async () => {
      const insertData: any = { title: "New Chat" };
      if (user) insertData.user_id = user.id;
      const { data, error } = await supabase
        .from("chat_sessions")
        .insert(insertData)
        .select()
        .single();
      if (!error && data) setSessionId(data.id);
    };
    createSession();
  }, [user]);

  useEffect(() => {
    const fetchDocuments = async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, title")
        .order("created_at", { ascending: false });
      if (data) setDocuments(data);
    };
    fetchDocuments();
  }, [user]);

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

      try {
        const startTime = Date.now();
        const docId = selectedDocumentId === "all" ? undefined : selectedDocumentId;
        const response = await sendChat(content, sessionId, docId);
        const latencyMs = Date.now() - startTime;

        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.content,
          citations: response.citations,
          confidenceScore: response.confidenceScore,
          latencyMs,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        supabase
          .from("chat_messages")
          .insert([
            { session_id: sessionId, role: "user", content },
            {
              session_id: sessionId,
              role: "assistant",
              content: response.content,
              citations: JSON.parse(JSON.stringify(response.citations)),
              confidence_score: response.confidenceScore,
              latency_ms: latencyMs,
            },
          ])
          .then(({ error }) => {
            if (error) console.error("Failed to save messages:", error);
          });
      } catch (error) {
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId, selectedDocumentId]
  );

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 px-4">
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
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border/50">
        <div className="max-w-3xl mx-auto space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <Select value={selectedDocumentId} onValueChange={setSelectedDocumentId}>
              <SelectTrigger className="w-[220px] h-8 text-xs bg-secondary border-border/50">
                <SelectValue placeholder="All documents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All documents</SelectItem>
                {documents.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ChatInput onSend={handleSend} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
