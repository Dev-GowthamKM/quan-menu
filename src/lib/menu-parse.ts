import { SIZE_KEYS, type DrinkOpts, type SizeKey } from "./types";

/** One dish found in a photographed menu by the free in-browser reader. */
export interface ParsedDish {
  vi: string;
  price: number;
  sizes?: DrinkOpts["sizes"];
}

// "45k", "45K", "45.000", "45,000", "45.000đ", "45000 vnđ", "45" (street shorthand for 45.000)
const PRICE = /(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(k\b|K\b|nghìn|ngàn|đ|d\b|vnđ|vnd|₫)?/gi;

function toVnd(num: string, unit?: string): number {
  const n = Number(num.replace(/[.,]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (unit && /^(k|nghìn|ngàn)$/i.test(unit)) return n * 1000;
  // Street menus write "45" for 45.000₫. Real prices are at least 1.000₫.
  if (n < 1000) return n * 1000;
  return n;
}

/** Plausible prices for one dish or drink: 1.000₫ to 2.000.000₫. */
const plausible = (v: number) => v >= 1000 && v <= 2_000_000;

function pricesIn(line: string): { prices: number[]; rest: string } {
  const prices: number[] = [];
  let rest = line;
  for (const m of line.matchAll(PRICE)) {
    const v = toVnd(m[1], m[2]);
    // A bare 1–2 digit number that isn't at the end of the line is usually part of a name ("Bún 2 trứng").
    const atEnd = line.slice((m.index ?? 0) + m[0].length).replace(/[\s.\-–—:|/xX]/g, "") === "" || prices.length > 0;
    if (!plausible(v) || (!m[2] && m[1].length <= 2 && !atEnd)) continue;
    prices.push(v);
    rest = rest.replace(m[0], " ");
  }
  return { prices, rest };
}

function cleanName(s: string): string {
  return s
    .replace(/^[\s\d]{1,3}[.)\-–]\s+/, "") // "1. Phở" / "12) Bún"
    .replace(/[.·…_\-–—:|*•]{2,}/g, " ") // dot leaders "Phở bò ........ 45k"
    .replace(/[|*•]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.\-–—:,;/]+|[\s.\-–—:,;/]+$/g, "")
    .trim();
}

/** Lines that are headings or noise rather than dishes. */
const SKIP = /^(thực đơn|menu|giá|món chính|đồ uống|nước uống|thức uống|khai vị|tráng miệng|size|đvt|stt|tên món|ghi chú)$/i;

/**
 * Turns text read from a menu photo into dishes and prices. Handles dot leaders, "45k" and
 * "45.000đ" prices, prices on the next line, and two or three prices on a line (sizes M/L or S/M/L).
 */
export function parseMenuText(text: string): ParsedDish[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedDish[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    let { prices, rest } = pricesIn(lines[i]);
    let name = cleanName(rest);
    // Price alone on the next line.
    if (!prices.length && i + 1 < lines.length) {
      const next = pricesIn(lines[i + 1]);
      if (next.prices.length && cleanName(next.rest).length < 2) {
        prices = next.prices;
        i++;
      }
    }
    const letters = (name.match(/\p{L}/gu) ?? []).length;
    if (letters < 2 || name.length > 60 || SKIP.test(name) || !prices.length) continue;
    // Drop stray marks the reader picks up from dot leaders and borders ("Trà đá <‹").
    name = respace(name.replace(/(\s+[^\p{L}\s]+)+$/u, "").replace(/\s+\p{L}$/u, "").trim());
    name = name.charAt(0).toUpperCase() + name.slice(1);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const dish: ParsedDish = { vi: name, price: prices[0] };
    if (prices.length >= 2 && prices.length <= 3) {
      const keys: SizeKey[] = prices.length === 2 ? ["M", "L"] : [...SIZE_KEYS];
      const sizes = prices.slice(0, keys.length).map((p, k) => ({ k: keys[k], price: p }));
      if (sizes.every((z, k) => k === 0 || z.price >= sizes[k - 1].price)) dish.sizes = sizes;
    }
    out.push(dish);
  }
  return out;
}

/* ── Re-spacing words the reader ran together ("Bánhmìthịt" → "Bánh mì thịt") ── */

const ONSETS = ["ngh", "ng", "nh", "ch", "gh", "gi", "kh", "ph", "qu", "th", "tr", "b", "c", "d", "đ", "g", "h", "k", "l", "m", "n", "p", "r", "s", "t", "v", "x"];
const CODAS = ["ch", "ng", "nh", "c", "m", "n", "p", "t"];
const isVowel = (ch: string) => "aeiouy".includes(ch.normalize("NFD")[0]);

/** Length of the onset if `s` is one valid Vietnamese syllable, else -1. */
function syllable(s: string): number {
  const onset = ONSETS.find((o) => s.startsWith(o)) ?? "";
  let i = onset.length;
  const start = i;
  while (i < s.length && isVowel(s[i])) i++;
  const nucleus = i - start;
  if (nucleus < 1 || nucleus > 3) return -1;
  const coda = s.slice(i);
  if (coda && !CODAS.includes(coda)) return -1;
  return onset.length;
}

/** Splits one run-together word into syllables, or returns it unchanged when it can't be split cleanly. */
function respaceWord(word: string): string {
  const s = word.normalize("NFC");
  const low = s.toLowerCase();
  if (s.length < 5 || !/^\p{L}+$/u.test(s)) return word;
  const n = low.length;
  // best[i] = [syllables, onset letters] for low[0..i); fewer syllables, then longer onsets ("cà phê", not "càp hê").
  const best: ([number, number, number] | null)[] = Array(n + 1).fill(null);
  best[0] = [0, 0, -1];
  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(0, i - 8); j < i; j++) {
      if (!best[j]) continue;
      const on = syllable(low.slice(j, i));
      if (on < 0) continue;
      const cand: [number, number, number] = [best[j]![0] + 1, best[j]![1] + on, j];
      const cur = best[i];
      if (!cur || cand[0] < cur[0] || (cand[0] === cur[0] && cand[1] > cur[1])) best[i] = cand;
    }
  }
  if (!best[n] || best[n]![0] < 2) return word;
  const cuts: number[] = [];
  for (let i = n; i > 0; i = best[i]![2]) cuts.unshift(i);
  let prev = 0;
  return cuts.map((c) => { const part = s.slice(prev, c); prev = c; return part; }).join(" ");
}

export function respace(name: string): string {
  return name.split(/\s+/).map(respaceWord).join(" ");
}
