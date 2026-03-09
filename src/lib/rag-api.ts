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

export interface ChatResponse {
  content: string;
  citations: Citation[];
  confidenceScore: number;
  chunksRetrieved: number;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rag-chat`;

export async function sendChat(
  message: string,
  sessionId: string,
  documentId?: string
): Promise<ChatResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  // Get current session token if logged in
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  try {
    const response = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message, sessionId, documentId }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please wait a moment and try again.");
      }
      if (response.status === 402) {
        throw new Error("Usage credits exhausted. Please add credits to continue.");
      }
      throw new Error(errorData.error || `Request failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  }
}

export async function ingestDocument(
  title: string,
  content: string,
  sourceType: "pdf" | "text" | "url",
  sourceUrl?: string
): Promise<{ documentId: string; chunksCreated: number; totalTokens: number }> {
  // Get current user id if logged in
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const { data, error } = await supabase.functions.invoke("ingest-document", {
    body: { title, content, sourceType, sourceUrl, userId },
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
