import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function chunkText(text: string, chunkSize = 300, overlap = 50): string[] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const chunks: string[] = [];
  
  let i = 0;
  while (i < words.length) {
    const chunkWords = words.slice(i, i + chunkSize);
    const chunk = chunkWords.join(' ').trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    i += chunkSize - overlap;
    if (i >= words.length) break;
  }
  
  return chunks;
}

function cleanText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    // Remove non-printable chars but keep basic punctuation, letters, digits, whitespace
    .replace(/[^\x20-\x7E\xA0-\xFF\n\u0100-\uFFFF]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isQualityChunk(text: string): boolean {
  if (text.length < 20) return false;
  
  const words = text.split(/\s+/);
  if (words.length < 5) return false;
  
  // Check ratio of alphabetic characters vs total
  const alphaChars = (text.match(/[a-zA-Z]/g) || []).length;
  const alphaRatio = alphaChars / text.length;
  if (alphaRatio < 0.3) return false;
  
  // Check for garbled patterns (repeated short patterns)
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  if (uniqueWords.size < words.length * 0.1 && words.length > 10) return false;
  
  return true;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, content, sourceType, sourceUrl, userId } = await req.json();
    console.log("Ingesting document:", title, "Type:", sourceType);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Content is now always plain text (PDF extraction happens client-side)
    const cleanedContent = cleanText(content);
    console.log("Cleaned content length:", cleanedContent.length);

    if (cleanedContent.length < 10) {
      throw new Error("Document content is too short or unreadable");
    }

    // Check overall text quality
    const alphaChars = (cleanedContent.match(/[a-zA-Z]/g) || []).length;
    const alphaRatio = alphaChars / cleanedContent.length;
    if (alphaRatio < 0.2) {
      throw new Error("Document text quality is too low. The content appears garbled or non-textual.");
    }

    // Create document record
    const insertData: Record<string, unknown> = {
      title,
      source_type: sourceType,
      source_url: sourceUrl,
      content: cleanedContent,
      metadata: {
        originalLength: content.length,
        cleanedLength: cleanedContent.length,
      },
    };
    if (userId) insertData.user_id = userId;

    const { data: document, error: docError } = await supabase
      .from("documents")
      .insert(insertData)
      .select()
      .single();

    if (docError) {
      throw new Error(`Failed to create document: ${docError.message}`);
    }

    // Chunk and filter for quality
    const rawChunks = chunkText(cleanedContent);
    const qualityChunks = rawChunks.filter(isQualityChunk);
    console.log(`Chunks: ${rawChunks.length} total, ${qualityChunks.length} quality`);

    if (qualityChunks.length === 0) {
      // Clean up the document if no quality chunks
      await supabase.from("documents").delete().eq("id", document.id);
      throw new Error("No readable content could be extracted from the document.");
    }

    // Insert chunks in batches
    const batchSize = 50;
    let totalInserted = 0;
    
    for (let i = 0; i < qualityChunks.length; i += batchSize) {
      const batch = qualityChunks.slice(i, i + batchSize).map((chunkContent, idx) => ({
        document_id: document.id,
        content: chunkContent,
        chunk_index: i + idx,
        token_count: estimateTokens(chunkContent),
        metadata: { wordCount: chunkContent.split(/\s+/).length },
      }));

      const { error: chunksError } = await supabase
        .from("document_chunks")
        .insert(batch);

      if (chunksError) {
        throw new Error(`Failed to insert chunks: ${chunksError.message}`);
      }
      totalInserted += batch.length;
    }

    // Generate summary via AI
    let summary = "";
    try {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (LOVABLE_API_KEY) {
        const summaryText = cleanedContent.substring(0, 3000);
        const llmResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: "Summarize the following document in 1-2 sentences. Be concise and informative." },
              { role: "user", content: summaryText },
            ],
            stream: false,
            max_tokens: 100,
          }),
        });
        if (llmResp.ok) {
          const llmData = await llmResp.json();
          summary = llmData.choices?.[0]?.message?.content || "";
          if (summary) {
            await supabase.from("documents").update({ summary }).eq("id", document.id);
          }
        }
      }
    } catch (e) {
      console.error("Summary generation failed (non-fatal):", e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        documentId: document.id,
        chunksCreated: totalInserted,
        totalTokens: qualityChunks.reduce((sum, c) => sum + estimateTokens(c), 0),
        summary,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Ingest error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
