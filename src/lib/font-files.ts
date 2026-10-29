import "server-only";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// The font files a store's pages preload: its heading and body faces (Latin, in the weight and
// style it uses), found by next/font's family names (app/fonts.ts) in the built stylesheet,
// which every page's server bundle carries (next.config.ts). Preloaded, they arrive with the
// page, so headings don't reflow as the shopper starts reading, and none of the other faces a
// store could choose is fetched.

interface Face {
  family: string;
  style: string;
  min: number;
  max: number;
  url: string;
}

let faces: Face[] | null = null;

export function parseFaces(css: string): Face[] {
  const found: Face[] = [];
  for (const [, body] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const family = /font-family:\s*["']?([^;"']+)/.exec(body)?.[1]?.trim();
    const url = /url\(["']?([^)"']+\.woff2)["']?\)/.exec(body)?.[1];
    // Each face's Latin file (U+0000-00FF, which the build writes as u+00??): the others cover
    // alphabets a store's text rarely needs.
    const range = /unicode-range:\s*([^;]+)/.exec(body)?.[1] ?? "";
    if (!family || !url || (range && !/u\+(?:0+-0*ff|0*\?\?)(?![\w?])/i.test(range))) continue;
    const weight = /font-weight:\s*(\d+)(?:\s+(\d+))?/.exec(body);
    const min = Number(weight?.[1] ?? 400);
    found.push({ family, style: /font-style:\s*(\w+)/.exec(body)?.[1] ?? "normal", min, max: Number(weight?.[2] ?? min), url });
  }
  return found;
}

function builtFaces(): Face[] {
  try {
    const dir = path.join(process.cwd(), ".next", "static", "css");
    return readdirSync(dir)
      .filter((f) => f.endsWith(".css"))
      .flatMap((f) => parseFaces(readFileSync(path.join(dir, f), "utf8")));
  } catch {
    // No built stylesheet here (development, tests): nothing to preload.
    return [];
  }
}

/** The file to preload for a font family at a weight, upright or italic; null if there isn't one. */
export function fontFile(family: string, weight: number, italic = false, from: Face[] = (faces ??= builtFaces())): string | null {
  const style = italic ? "italic" : "normal";
  return from.find((f) => f.family === family && f.style === style && f.min <= weight && weight <= f.max)?.url ?? null;
}
