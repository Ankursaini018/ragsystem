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
    const { message, sessionId, documentId } = await req.json();
    console.log("RAG chat request:", message?.substring(0, 50), "docId:", documentId);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Step 1: Retrieve top 3 chunks via ILIKE keyword search
    const keywords = message.split(/\s+/).filter((w: string) => w.length > 3).slice(0, 5);
    let chunks: any[] = [];

    if (keywords.length > 0) {
      const orFilter = keywords.map((k: string) => `content.ilike.%${k}%`).join(',');
      let query = supabase
        .from("document_chunks")
        .select("id, document_id, content, chunk_index, metadata")
        .or(orFilter);
      if (documentId) query = query.eq("document_id", documentId);
      const { data, error } = await query.limit(3);

      if (error) {
        console.error("Search error:", error);
      } else {
        chunks = data || [];
      }
    }

    // Fallback: grab first 3 chunks
    if (chunks.length === 0) {
      let fallbackQuery = supabase
        .from("document_chunks")
        .select("id, document_id, content, chunk_index, metadata");
      if (documentId) fallbackQuery = fallbackQuery.eq("document_id", documentId);
      const { data } = await fallbackQuery.order("chunk_index", { ascending: true }).limit(3);
      chunks = data || [];
    }

    console.log("Found chunks:", chunks.length);

    // Step 2: Build context and citations
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

    // Step 3: Non-streaming LLM call with timeout
    const systemPrompt = `You are a helpful RAG assistant. Answer based on context provided.
Use [Source N] citations. Be concise and direct.
${context ? `\nCONTEXT:\n${context}` : "\nNO CONTEXT AVAILABLE. Say you couldn't find relevant information."}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    let llmResponse;
    try {
      llmResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
          stream: false,
          max_tokens: 200,
        }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
        console.error("LLM call timed out");
        return new Response(
          JSON.stringify({ error: "Request timed out. Please try a shorter question." }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw fetchError;
    }

    clearTimeout(timeoutId);

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error("LLM error:", llmResponse.status, errorText);
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
      return new Response(
        JSON.stringify({ error: `LLM API error: ${llmResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const llmData = await llmResponse.json();
    const content = llmData.choices?.[0]?.message?.content || "No response generated.";

    console.log("LLM response received, length:", content.length);

    return new Response(
      JSON.stringify({
        content,
        citations,
        confidenceScore: citations.length > 0 ? 0.7 : 0.1,
        chunksRetrieved: citations.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("RAG chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
