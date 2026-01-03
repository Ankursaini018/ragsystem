import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, sessionId } = await req.json();
    console.log("Received message:", message, "Session:", sessionId);

    const startTime = Date.now();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Step 1: Generate embedding for the query
    console.log("Generating query embedding...");
    const embeddingResponse = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: message,
        dimensions: 768,
      }),
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error("Embedding error:", errorText);
      throw new Error(`Embedding API error: ${embeddingResponse.status}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data?.[0]?.embedding;

    if (!queryEmbedding) {
      throw new Error("Failed to generate embedding");
    }

    // Step 2: Search for similar chunks
    console.log("Searching for similar chunks...");
    const { data: chunks, error: searchError } = await supabase.rpc(
      "search_similar_chunks",
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: 0.3,
        match_count: 5,
      }
    );

    if (searchError) {
      console.error("Search error:", searchError);
    }

    console.log("Found chunks:", chunks?.length || 0);

    // Step 3: Build context from retrieved chunks
    let context = "";
    const citations: Array<{
      chunkId: string;
      documentId: string;
      content: string;
      similarity: number;
      metadata: Record<string, unknown>;
    }> = [];

    if (chunks && chunks.length > 0) {
      // Get document titles for citations
      const documentIds = [...new Set(chunks.map((c: { document_id: string }) => c.document_id))];
      const { data: documents } = await supabase
        .from("documents")
        .select("id, title, source_type, source_url")
        .in("id", documentIds);

      const docMap = new Map(documents?.map((d: { id: string; title: string; source_type: string; source_url: string | null }) => [d.id, d]) || []);

      chunks.forEach((chunk: { id: string; document_id: string; content: string; similarity: number; metadata: Record<string, unknown> }, idx: number) => {
        const doc = docMap.get(chunk.document_id) as { title: string; source_type: string; source_url: string | null } | undefined;
        context += `[Source ${idx + 1}: ${doc?.title || "Unknown"}]\n${chunk.content}\n\n`;
        citations.push({
          chunkId: chunk.id,
          documentId: chunk.document_id,
          content: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? "..." : ""),
          similarity: chunk.similarity,
          metadata: {
            title: doc?.title,
            sourceType: doc?.source_type,
            sourceUrl: doc?.source_url,
            ...chunk.metadata,
          },
        });
      });
    }

    // Calculate confidence based on retrieved context
    const avgSimilarity = citations.length > 0 
      ? citations.reduce((sum, c) => sum + c.similarity, 0) / citations.length 
      : 0;
    const hasRelevantContext = avgSimilarity > 0.5;

    // Step 4: Generate response with LLM
    console.log("Generating response with LLM...");
    
    const systemPrompt = `You are a helpful RAG (Retrieval-Augmented Generation) assistant that answers questions based on provided context from documents.

IMPORTANT RULES:
1. Only answer based on the provided context. If the context doesn't contain relevant information, clearly state: "I couldn't find information about this in the available documents."
2. When citing information, reference the source using [Source N] notation.
3. Be precise and concise. Don't make up information not present in the context.
4. If the question is ambiguous, ask for clarification.
5. Structure your answers clearly with paragraphs when appropriate.

${context ? `RETRIEVED CONTEXT:\n${context}` : "NO CONTEXT AVAILABLE - The document database appears to be empty or no relevant documents were found."}`;

    const llmResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        stream: true,
      }),
    });

    if (!llmResponse.ok) {
      if (llmResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (llmResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await llmResponse.text();
      console.error("LLM error:", errorText);
      throw new Error(`LLM API error: ${llmResponse.status}`);
    }

    const latencyMs = Date.now() - startTime;

    // Create a TransformStream to add metadata to the stream
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    // Send initial metadata
    const metadataEvent = `data: ${JSON.stringify({
      type: "metadata",
      citations,
      confidenceScore: hasRelevantContext ? avgSimilarity : 0.1,
      latencyMs,
      chunksRetrieved: citations.length,
    })}\n\n`;

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    
    // Write metadata first
    await writer.write(encoder.encode(metadataEvent));

    // Pipe the LLM response
    const reader = llmResponse.body!.getReader();
    
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    console.error("RAG chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
