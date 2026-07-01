import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#([0-9]+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

async function fetchTranscript(videoId: string): Promise<{ title: string; text: string }> {
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!pageRes.ok) throw new Error(`YouTube page fetch failed: ${pageRes.status}`);
  const html = await pageRes.text();

  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? decodeHtml(titleMatch[1].replace(/ - YouTube$/, "")) : `YouTube ${videoId}`;

  // Find captionTracks in ytInitialPlayerResponse
  const captionsMatch = html.match(/"captionTracks":(\[.*?\])/);
  if (!captionsMatch) {
    throw new Error("No captions available for this video.");
  }
  let tracks: Array<{ baseUrl: string; languageCode: string; kind?: string; name?: { simpleText?: string } }>;
  try {
    tracks = JSON.parse(captionsMatch[1].replace(/\\u0026/g, "&"));
  } catch {
    throw new Error("Failed to parse captions metadata.");
  }
  if (!tracks.length) throw new Error("No caption tracks found.");

  // Prefer English, then any manual, then auto-generated
  const pick =
    tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ||
    tracks.find((t) => t.languageCode === "en") ||
    tracks.find((t) => t.kind !== "asr") ||
    tracks[0];

  const trackRes = await fetch(pick.baseUrl);
  if (!trackRes.ok) throw new Error(`Transcript fetch failed: ${trackRes.status}`);
  const xml = await trackRes.text();

  const segments = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    decodeHtml(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()
  );
  const text = segments.filter(Boolean).join(" ");
  if (text.length < 20) throw new Error("Transcript is empty or too short.");
  return { title, text };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") throw new Error("url is required");
    const videoId = extractVideoId(url.trim());
    if (!videoId) throw new Error("Invalid YouTube URL");
    const { title, text } = await fetchTranscript(videoId);
    return new Response(
      JSON.stringify({
        success: true,
        title,
        content: text,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        contentLength: text.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-youtube error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
