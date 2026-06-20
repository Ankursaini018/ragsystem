import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { images } = await req.json() as { images: string[] };
    if (!Array.isArray(images) || images.length === 0) {
      throw new Error("No images provided");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: "You are an OCR engine specialized in handwriting. Transcribe ALL text from the following image(s) exactly as written, preserving line breaks, lists, and paragraph structure. If multiple images are provided, treat them as consecutive pages in order. Output ONLY the raw transcribed text, with no commentary, headings, or markdown fences.",
      },
      ...images.map((url) => ({ type: "image_url", image_url: { url } })),
    ];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
        stream: false,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      if (resp.status === 429) {
        return new Response(JSON.stringify({ success: false, error: "Rate limit exceeded. Please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ success: false, error: "AI credits exhausted. Please add credits." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI gateway error: ${resp.status} ${errText}`);
    }

    const data = await resp.json();
    const text: string = data.choices?.[0]?.message?.content ?? "";

    if (!text.trim()) {
      throw new Error("No text could be extracted from the image(s).");
    }

    return new Response(
      JSON.stringify({ success: true, text }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("extract-handwriting error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
