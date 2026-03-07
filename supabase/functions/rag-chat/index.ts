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
    console.log("RAG chat request:", message?.substring(0, 50));
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Step 1: Quick search - use simple ILIKE for speed instead of full-text search
    const keywords = message.split(/\s+/).filter((w: string) => w.length > 3).slice(0, 5);
    let chunks: any[] = [];
    
    if (keywords.length > 0) {
      const orFilter = keywords.map((k: string) => `content.ilike.%${k}%`).join(',');
      const { data, error } = await supabase
        .from("document_chunks")
        .select("id, document_id, content, chunk_index, metadata")
        .or(orFilter)
        .limit(3);
      
      if (error) {
        console.error("Search error:", error);
      } else {
        chunks = data || [];
      }
    }

    // If no keyword matches, grab first few chunks as fallback context
    if (chunks.length === 0) {
      const { data } = await supabase
        .from("document_chunks")
        .select("id, document_id, content, chunk_index, metadata")
        .order("chunk_index", { ascending: true })
        .limit(3);
      chunks = data || [];
    }

    console.log("Found chunks:", chunks.length);

    // Step 2: Build context
    let context = "";
    const citations: any[] = [];

    if (chunks.length > 0) {
      const documentIds = [...new Set(chunks.map(c => c.document_id))];
      const { data: documents } = await supabase
        .from("documents")
        .select("id, title, source_type, source_url")
        .in("id", documentIds);

      const docMap = new Map(documents?.map(d => [d.id, d]) || []);

      chunks.forEach((chunk, idx) => {
        const doc = docMap.get(chunk.document_id) as any;
        // Truncate chunk content to 500 chars for faster LLM processing
        const truncated = chunk.content.substring(0, 500);
        context += `[Source ${idx + 1}: ${doc?.title || "Unknown"}]\n${truncated}\n\n`;

        citations.push({
          chunkId: chunk.id,
          documentId: chunk.document_id,
          content: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? "..." : ""),
          similarity: 0.7,
          metadata: {
            title: doc?.title,
            sourceType: doc?.source_type,
            sourceUrl: doc?.source_url,
          },
        });
      });
    }

    // Step 3: Generate response with fast model and timeout
    const systemPrompt = `You are a helpful RAG assistant. Answer based on context provided.
Use [Source N] citations. Be concise and direct.
${context ? `\nCONTEXT:\n${context}` : "\nNO CONTEXT AVAILABLE. Say you couldn't find relevant information."}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

    try {
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
          max_tokens: 300,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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
        console.error("LLM error:", llmResponse.status, errorText);
        throw new Error(`LLM API error: ${llmResponse.status}`);
      }

      // Stream response with metadata prepended
      const encoder = new TextEncoder();
      const metadataEvent = `data: ${JSON.stringify({
        type: "metadata",
        citations,
        confidenceScore: citations.length > 0 ? 0.7 : 0.1,
        latencyMs: 0,
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

    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: "Request timed out. Please try a shorter question." }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw fetchError;
    }

  } catch (error) {
    console.error("RAG chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
