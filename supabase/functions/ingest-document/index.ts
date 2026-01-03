import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple text chunker with overlap
function chunkText(text: string, chunkSize = 400, overlap = 50): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  
  let i = 0;
  while (i < words.length) {
    const chunkWords = words.slice(i, i + chunkSize);
    const chunk = chunkWords.join(' ');
    if (chunk.trim().length > 0) {
      chunks.push(chunk.trim());
    }
    i += chunkSize - overlap;
    if (i + overlap >= words.length && i < words.length) break;
  }
  
  // Add remaining words if any
  if (i < words.length) {
    const remaining = words.slice(i).join(' ').trim();
    if (remaining.length > 0) {
      chunks.push(remaining);
    }
  }
  
  return chunks;
}

// Clean text by removing extra whitespace and special characters
function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .replace(/[^\x20-\x7E\n]/g, ' ') // Replace non-printable chars with space
    .trim();
}

// Estimate token count (rough approximation: ~4 chars per token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, content, sourceType, sourceUrl } = await req.json();
    console.log("Ingesting document:", title, "Type:", sourceType);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Clean the text
    const cleanedContent = cleanText(content);
    console.log("Cleaned content length:", cleanedContent.length);

    if (cleanedContent.length < 10) {
      throw new Error("Document content is too short to process");
    }

    // Create document record
    const { data: document, error: docError } = await supabase
      .from("documents")
      .insert({
        title,
        source_type: sourceType,
        source_url: sourceUrl,
        content: cleanedContent,
        metadata: {
          originalLength: content.length,
          cleanedLength: cleanedContent.length,
        },
      })
      .select()
      .single();

    if (docError) {
      console.error("Document insert error:", docError);
      throw new Error(`Failed to create document: ${docError.message}`);
    }

    console.log("Document created:", document.id);

    // Chunk the text
    const chunks = chunkText(cleanedContent);
    console.log("Created chunks:", chunks.length);

    // Create chunk records (no embeddings - using full-text search instead)
    const chunkRecords = chunks.map((chunkContent, idx) => ({
      document_id: document.id,
      content: chunkContent,
      chunk_index: idx,
      token_count: estimateTokens(chunkContent),
      metadata: {
        wordCount: chunkContent.split(/\s+/).length,
      },
    }));

    // Insert all chunks (the trigger will auto-generate search_vector)
    console.log("Inserting chunks:", chunkRecords.length);
    const { error: chunksError } = await supabase
      .from("document_chunks")
      .insert(chunkRecords);

    if (chunksError) {
      console.error("Chunks insert error:", chunksError);
      throw new Error(`Failed to insert chunks: ${chunksError.message}`);
    }

    console.log("Document ingestion complete");

    return new Response(
      JSON.stringify({
        success: true,
        documentId: document.id,
        chunksCreated: chunkRecords.length,
        totalTokens: chunkRecords.reduce((sum, c) => sum + c.token_count, 0),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Ingest error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
