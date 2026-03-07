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
    const startTime = Date.now();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Step 1: Search for similar chunks using full-text search
    const { data: chunks, error: searchError } = await supabase.rpc(
      "search_chunks_fulltext",
      { search_query: message, match_count: 3 }
    );

    if (searchError) {
      console.error("Search error:", searchError);
    }

    // Step 2: Build context from retrieved chunks
    let context = "";
    const citations: Array<{
      chunkId: string;
      documentId: string;
      content: string;
      similarity: number;
      metadata: Record<string, unknown>;
    }> = [];

    if (chunks && chunks.length > 0) {
      const documentIds = [...new Set(chunks.map((c: { document_id: string }) => c.document_id))];
      const { data: documents } = await supabase
        .from("documents")
        .select("id, title, source_type, source_url")
        .in("id", documentIds);

      const docMap = new Map(documents?.map((d: { id: string; title: string; source_type: string; source_url: string | null }) => [d.id, d]) || []);
      const maxRank = Math.max(...chunks.map((c: { rank: number }) => c.rank));
      
      chunks.forEach((chunk: { id: string; document_id: string; content: string; rank: number; metadata: Record<string, unknown> }, idx: number) => {
        const doc = docMap.get(chunk.document_id) as { title: string; source_type: string; source_url: string | null } | undefined;
        context += `[Source ${idx + 1}: ${doc?.title || "Unknown"}]\n${chunk.content}\n\n`;
        const normalizedScore = maxRank > 0 ? Math.min(chunk.rank / maxRank, 1) : 0.5;
        
        citations.push({
          chunkId: chunk.id,
          documentId: chunk.document_id,
          content: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? "..." : ""),
          similarity: normalizedScore,
          metadata: {
            title: doc?.title,
            sourceType: doc?.source_type,
            sourceUrl: doc?.source_url,
            ...chunk.metadata,
          },
        });
      });
    }

    const avgSimilarity = citations.length > 0 
      ? citations.reduce((sum, c) => sum + c.similarity, 0) / citations.length 
      : 0;
    const hasRelevantContext = citations.length > 0 && avgSimilarity > 0.3;

    // Step 3: Generate response with faster model
    const systemPrompt = `You are a RAG assistant. Answer based on the provided context only.
Rules:
- Use [Source N] citations when referencing context.
- Say "I couldn't find information about this in the available documents." if no relevant context.
- Be concise.

${context ? `CONTEXT:\n${context}` : "NO CONTEXT AVAILABLE."}`;

    const llmResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        stream: true,
        max_tokens: 512,
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
          JSON.stringify({ error: "Payment required. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await llmResponse.text();
      console.error("LLM error:", errorText);
      throw new Error(`LLM API error: ${llmResponse.status}`);
    }

    const latencyMs = Date.now() - startTime;

    const encoder = new TextEncoder();
    const metadataEvent = `data: ${JSON.stringify({
      type: "metadata",
      citations,
      confidenceScore: hasRelevantContext ? avgSimilarity : 0.1,
      latencyMs,
      chunksRetrieved: citations.length,
    })}\n\n`;

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    
    await writer.write(encoder.encode(metadataEvent));

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
