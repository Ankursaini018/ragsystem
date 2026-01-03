import { supabase } from "@/integrations/supabase/client";

export interface Citation {
  chunkId: string;
  documentId: string;
  content: string;
  similarity: number;
  metadata: {
    title?: string;
    sourceType?: string;
    sourceUrl?: string;
    [key: string]: unknown;
  };
}

export interface ChatMetadata {
  citations: Citation[];
  confidenceScore: number;
  latencyMs: number;
  chunksRetrieved: number;
}

export interface StreamCallbacks {
  onMetadata: (metadata: ChatMetadata) => void;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rag-chat`;

export async function streamChat(
  message: string,
  sessionId: string,
  callbacks: StreamCallbacks
): Promise<void> {
  try {
    const response = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ message, sessionId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 429) {
        callbacks.onError("Rate limit exceeded. Please wait a moment and try again.");
        return;
      }
      if (response.status === 402) {
        callbacks.onError("Usage credits exhausted. Please add credits to continue.");
        return;
      }
      throw new Error(errorData.error || `Request failed: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          callbacks.onDone();
          return;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          
          // Handle metadata event
          if (parsed.type === "metadata") {
            callbacks.onMetadata({
              citations: parsed.citations,
              confidenceScore: parsed.confidenceScore,
              latencyMs: parsed.latencyMs,
              chunksRetrieved: parsed.chunksRetrieved,
            });
            continue;
          }

          // Handle content delta
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            callbacks.onDelta(content);
          }
        } catch {
          // Incomplete JSON, put back and wait
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    callbacks.onDone();
  } catch (error) {
    callbacks.onError(error instanceof Error ? error.message : "Unknown error");
  }
}

export async function ingestDocument(
  title: string,
  content: string,
  sourceType: "pdf" | "text" | "url",
  sourceUrl?: string
): Promise<{ documentId: string; chunksCreated: number; totalTokens: number }> {
  const { data, error } = await supabase.functions.invoke("ingest-document", {
    body: { title, content, sourceType, sourceUrl },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.success) {
    throw new Error(data.error || "Ingestion failed");
  }

  return {
    documentId: data.documentId,
    chunksCreated: data.chunksCreated,
    totalTokens: data.totalTokens,
  };
}

export async function fetchUrlContent(
  url: string
): Promise<{ title: string; content: string; url: string }> {
  const { data, error } = await supabase.functions.invoke("fetch-url", {
    body: { url },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.success) {
    throw new Error(data.error || "Failed to fetch URL");
  }

  return {
    title: data.title,
    content: data.content,
    url: data.url,
  };
}
