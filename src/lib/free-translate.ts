import type { ML } from "./types";

/**
 * Free machine translation of dish names with MyMemory (https://mymemory.translated.net), which
 * needs no key. Anonymous use allows about 5,000 characters a day per server; setting
 * MYMEMORY_EMAIL raises that to 50,000. Results are marked as machine translations in the editor.
 */
const BASE = process.env.FREE_TRANSLATE_URL || "https://api.mymemory.translated.net/get";
const TARGETS: [keyof ML, string][] = [["en", "en-GB"], ["ko", "ko-KR"], ["zh", "zh-CN"], ["ja", "ja-JP"]];

async function one(text: string, target: string): Promise<string> {
  const url = new URL(BASE);
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", `vi-VN|${target}`);
  if (process.env.MYMEMORY_EMAIL) url.searchParams.set("de", process.env.MYMEMORY_EMAIL);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "force-cache" });
  if (!res.ok) return "";
  const json = (await res.json().catch(() => null)) as { responseStatus?: number | string; responseData?: { translatedText?: string } } | null;
  const out = json?.responseData?.translatedText?.trim() ?? "";
  // The service puts quota warnings in the translation itself.
  if (Number(json?.responseStatus) !== 200 || !out || /MYMEMORY WARNING|QUERY LENGTH|INVALID/i.test(out)) return "";
  return out.slice(0, 120);
}

/** Translates each Vietnamese name into English, Korean, Chinese and Japanese. Null where English failed. */
export async function freeTranslate(names: string[]): Promise<(ML | null)[]> {
  return Promise.all(
    names.map(async (vi) => {
      const parts = await Promise.all(TARGETS.map(([, code]) => one(vi, code).catch(() => "")));
      if (!parts[0]) return null;
      const ml = Object.fromEntries(TARGETS.map(([k], i) => [k, parts[i] || parts[0]])) as ML;
      // Title-case short English names ("crab noodle soup" -> "Crab noodle soup").
      ml.en = ml.en.charAt(0).toUpperCase() + ml.en.slice(1);
      return ml;
    }),
  );
}
