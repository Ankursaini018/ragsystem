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
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .trim();
}

// Estimate token count (rough approximation: ~4 chars per token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Extract text from PDF using pdf-parse compatible approach
async function extractPdfText(base64Data: string): Promise<string> {
  try {
    // Decode base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Simple PDF text extraction - find text between stream/endstream and extract readable content
    const pdfText = new TextDecoder('latin1').decode(bytes);
    
    // Extract text from PDF streams (basic extraction)
    const textParts: string[] = [];
    
    // Method 1: Look for text in parentheses (PDF string literals)
    const stringMatches = pdfText.matchAll(/\(([^)]+)\)/g);
    for (const match of stringMatches) {
      const text = match[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, ' ')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\');
      if (text.length > 2 && /[a-zA-Z]{2,}/.test(text)) {
        textParts.push(text);
      }
    }
    
    // Method 2: Look for BT...ET text blocks with Tj/TJ operators
    const textBlockMatches = pdfText.matchAll(/BT\s*([\s\S]*?)\s*ET/g);
    for (const match of textBlockMatches) {
      const block = match[1];
      // Extract text from Tj operators
      const tjMatches = block.matchAll(/\(([^)]*)\)\s*Tj/g);
      for (const tj of tjMatches) {
        const text = tj[1].replace(/\\[nrt]/g, ' ');
        if (text.length > 1) {
          textParts.push(text);
        }
      }
      // Extract text from TJ arrays
      const arrayMatches = block.matchAll(/\[(.*?)\]\s*TJ/g);
      for (const arr of arrayMatches) {
        const parts = arr[1].matchAll(/\(([^)]*)\)/g);
        for (const part of parts) {
          if (part[1].length > 0) {
            textParts.push(part[1]);
          }
        }
      }
    }
    
    const extractedText = textParts.join(' ');
    
    if (extractedText.length < 50) {
      throw new Error("Could not extract sufficient text from PDF. The PDF may be scanned/image-based.");
    }
    
    return extractedText;
  } catch (error) {
    console.error("PDF extraction error:", error);
    throw new Error("Failed to extract text from PDF. Please try uploading a text-based PDF or paste the content as text.");
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
    
    // If PDF, extract text from base64
    if (sourceType === "pdf") {
      console.log("Extracting text from PDF...");
      textContent = await extractPdfText(content);
      console.log("Extracted PDF text length:", textContent.length);
    }

    // Clean the text
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
          originalLength: sourceType === "pdf" ? textContent.length : content.length,
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

    // Create chunk records
    const chunkRecords = chunks.map((chunkContent, idx) => ({
      document_id: document.id,
      content: chunkContent,
      chunk_index: idx,
      token_count: estimateTokens(chunkContent),
      metadata: {
        wordCount: chunkContent.split(/\s+/).length,
      },
    }));

    // Insert all chunks
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
