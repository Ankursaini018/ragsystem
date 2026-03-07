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
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function extractPdfText(base64Data: string): string {
  try {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const pdfText = new TextDecoder('latin1').decode(bytes);
    const textParts: string[] = [];
    
    // Method 1: BT...ET text blocks with Tj/TJ operators (most reliable)
    const textBlockMatches = pdfText.matchAll(/BT\s*([\s\S]*?)\s*ET/g);
    for (const match of textBlockMatches) {
      const block = match[1];
      const tjMatches = block.matchAll(/\(([^)]*)\)\s*Tj/g);
      for (const tj of tjMatches) {
        const text = tj[1].replace(/\\[nrt]/g, ' ').replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\');
        if (text.length > 0) textParts.push(text);
      }
      const arrayMatches = block.matchAll(/\[(.*?)\]\s*TJ/g);
      for (const arr of arrayMatches) {
        const parts = arr[1].matchAll(/\(([^)]*)\)/g);
        for (const part of parts) {
          if (part[1].length > 0) {
            const cleaned = part[1].replace(/\\[nrt]/g, ' ').replace(/\\\(/g, '(').replace(/\\\)/g, ')');
            textParts.push(cleaned);
          }
        }
      }
    }
    
    // Method 2: Fallback - text in parentheses (only if method 1 didn't find enough)
    if (textParts.join(' ').length < 50) {
      const stringMatches = pdfText.matchAll(/\(([^)]{3,})\)/g);
      for (const match of stringMatches) {
        const text = match[1].replace(/\\[nrt]/g, ' ');
        if (/[a-zA-Z]{2,}/.test(text)) {
          textParts.push(text);
        }
      }
    }
    
    const extractedText = textParts.join(' ');
    
    if (extractedText.length < 20) {
      throw new Error("Could not extract text from PDF. It may be scanned/image-based.");
    }
    
    return extractedText;
  } catch (error) {
    console.error("PDF extraction error:", error);
    throw new Error("Failed to extract text from PDF. Try pasting the content as text instead.");
  }
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

    let textContent = content;
    
    if (sourceType === "pdf") {
      console.log("Extracting text from PDF...");
      textContent = extractPdfText(content);
      console.log("Extracted PDF text length:", textContent.length);
    }

    const cleanedContent = cleanText(textContent);
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
      throw new Error(`Failed to create document: ${docError.message}`);
    }

    // Chunk the text with smaller chunks for better search
    const chunks = chunkText(cleanedContent);
    console.log("Created chunks:", chunks.length);

    // Insert chunks in batches of 50 for speed
    const batchSize = 50;
    let totalInserted = 0;
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize).map((chunkContent, idx) => ({
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

    return new Response(
      JSON.stringify({
        success: true,
        documentId: document.id,
        chunksCreated: totalInserted,
        totalTokens: chunks.reduce((sum, c) => sum + estimateTokens(c), 0),
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
