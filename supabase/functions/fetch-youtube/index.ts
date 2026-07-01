import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([A-Za-z0-9_-]{11})/,
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

async function fetchYoutubePage(videoId: string): Promise<string> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en&persist_hl=1`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      // Skip EU consent interstitial
      Cookie: "CONSENT=YES+cb; SOCS=CAI",
    },
  });
  if (!res.ok) throw new Error(`YouTube page fetch failed: ${res.status}`);
  return await res.text();
}

async function fetchTranscript(videoId: string): Promise<{ title: string; text: string }> {
  const html = await fetchYoutubePage(videoId);

  const titleMatch =
    html.match(/<meta name="title" content="([^"]+)"/) ||
    html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch
    ? decodeHtml(titleMatch[1].replace(/ - YouTube$/, "").trim())
    : `YouTube ${videoId}`;

  // captionTracks lives inside ytInitialPlayerResponse (JSON embedded in HTML)
  const capsMatch = html.match(/"captionTracks":\s*(\[[^\]]+\])/);
  if (!capsMatch) {
    throw new Error(
      "No captions/subtitles available for this video. Try a video that has CC enabled."
    );
  }

  let tracks: Array<{ baseUrl: string; languageCode: string; kind?: string }>;
  try {
    const raw = capsMatch[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    tracks = JSON.parse(raw);
  } catch (e) {
    throw new Error("Failed to parse captions metadata.");
  }
  if (!tracks?.length) throw new Error("No caption tracks found.");

  const pick =
    tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ||
    tracks.find((t) => t.languageCode?.startsWith("en")) ||
    tracks.find((t) => t.kind !== "asr") ||
    tracks[0];

  const trackUrl = pick.baseUrl.replace(/\\u0026/g, "&");
  const trackRes = await fetch(trackUrl, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!trackRes.ok) throw new Error(`Transcript fetch failed: ${trackRes.status}`);
  const xml = await trackRes.text();

  const segments = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    decodeHtml(decodeHtml(m[1]).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()
  );
  const text = segments.filter(Boolean).join(" ");
  if (text.length < 20)
    throw new Error("Transcript is empty. This video may not have real captions.");
  return { title, text };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") throw new Error("url is required");
    const videoId = extractVideoId(url.trim());
    if (!videoId) throw new Error("Invalid YouTube URL");
    console.log("fetch-youtube: videoId =", videoId);
    const { title, text } = await fetchTranscript(videoId);
    console.log("fetch-youtube: transcript length =", text.length);
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
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
