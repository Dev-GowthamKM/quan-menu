import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Vietnamese speech for the menu's "Say it" and "Read the order aloud" buttons: a short MP3 of
 * Google Translate's Vietnamese voice (a woman's), so it sounds the same on every phone, including
 * the many with no Vietnamese voice of their own. It is free and unofficial, so each text is fetched
 * once and then served from Vercel's cache for a year. If Google refuses, this answers 502 and the
 * menu uses the phone's own voice instead.
 */
const HOST = process.env.SAY_URL || "https://translate.google.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const audio = (buf: Buffer) => (buf.length > 200 ? buf : null);

/** The plain audio address Translate's speaker button uses. */
async function fromTts(text: string): Promise<Buffer | null> {
  const q = new URLSearchParams({ ie: "UTF-8", q: text, tl: "vi", total: "1", idx: "0", textlen: String(text.length), client: "tw-ob", prev: "input", ttsspeed: "1" });
  const r = await fetch(`${HOST}/translate_tts?${q}`, {
    headers: { "user-agent": UA, referer: "https://translate.google.com/" },
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok || !(r.headers.get("content-type") || "").startsWith("audio/")) return null;
  return audio(Buffer.from(await r.arrayBuffer()));
}

/** Translate's own page request, which answers with the audio as base64. Used when the first one is refused. */
async function fromBatch(text: string): Promise<Buffer | null> {
  const req = JSON.stringify([[["jQ1olc", JSON.stringify([text, "vi", null, "null"]), null, "generic"]]]);
  const r = await fetch(`${HOST}/_/TranslateWebserverUi/data/batchexecute`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "user-agent": UA },
    body: "f.req=" + encodeURIComponent(req),
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) return null;
  for (const line of (await r.text()).split("\n")) {
    if (!line.startsWith("[[")) continue;
    try {
      const hit = (JSON.parse(line) as unknown[][]).find((e) => e[0] === "wrb.fr" && e[1] === "jQ1olc");
      const inner: unknown = typeof hit?.[2] === "string" ? JSON.parse(hit[2]) : null;
      if (Array.isArray(inner) && typeof inner[0] === "string") return audio(Buffer.from(inner[0], "base64"));
    } catch {}
  }
  return null;
}

export async function GET(req: Request) {
  const text = (new URL(req.url).searchParams.get("t") || "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!text || text.length > 150) return NextResponse.json({ error: "Text must be 1 to 150 characters." }, { status: 400 });
  let buf: Buffer | null = null;
  let via = "";
  for (const [name, get] of [["tts", fromTts], ["batch", fromBatch]] as const) {
    buf = await get(text).catch(() => null);
    if (buf) { via = name; break; }
  }
  if (!buf) {
    console.error("[say] no Vietnamese voice for", JSON.stringify(text));
    return NextResponse.json({ error: "Voice unavailable." }, { status: 502, headers: { "cache-control": "no-store" } });
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "x-voice": via,
    },
  });
}
