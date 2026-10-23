// Store colours. The admin picks four in Settings › Appearance: text, buttons and bands,
// accent and background. Everything else the storefront paints with (panels, borders,
// secondary text, the words on buttons) is derived from those four here, with contrast
// checked, so any combination stays readable.
import type { StoreSettings } from "./types";

export interface ThemeColors {
  text: string;
  brand: string;
  accent: string;
  background: string;
}

export const HEADING_FONT_KEYS = ["cormorant", "playfair", "bodoni", "dm-serif"] as const;
export const BODY_FONT_KEYS = ["jost", "inter", "manrope", "dm-sans"] as const;
export type HeadingFont = (typeof HEADING_FONT_KEYS)[number];
export type BodyFont = (typeof BODY_FONT_KEYS)[number];

/** The weight headings are set in, chosen per face so none looks faint. */
export const HEADING_WEIGHT: Record<HeadingFont, number> = { cormorant: 500, playfair: 500, bodoni: 500, "dm-serif": 400 };

export interface ThemePreset {
  key: string;
  name: string;
  colors: ThemeColors;
  heading_font: HeadingFont;
  body_font: BodyFont;
  heading_italic: boolean;
}

/** One-click looks in Settings › Appearance. The first is the default for new stores. */
export const THEME_PRESETS: ThemePreset[] = [
  { key: "wine", name: "Wine and gold", colors: { text: "#1f1416", brand: "#6b1d2e", accent: "#b07d2b", background: "#fbf6ee" }, heading_font: "cormorant", body_font: "jost", heading_italic: true },
  { key: "indigo", name: "Indigo and saffron", colors: { text: "#121a2c", brand: "#24366f", accent: "#c8741c", background: "#f6f4ef" }, heading_font: "bodoni", body_font: "manrope", heading_italic: true },
  { key: "emerald", name: "Emerald and brass", colors: { text: "#132019", brand: "#114a3a", accent: "#a8843f", background: "#f5f2e9" }, heading_font: "playfair", body_font: "dm-sans", heading_italic: true },
  { key: "rose", name: "Rose and copper", colors: { text: "#2a1519", brand: "#a3324f", accent: "#b9713f", background: "#fdf5f3" }, heading_font: "dm-serif", body_font: "inter", heading_italic: true },
  { key: "noir", name: "Black and white", colors: { text: "#0d0d0d", brand: "#0d0d0d", accent: "#94733a", background: "#ffffff" }, heading_font: "bodoni", body_font: "inter", heading_italic: false },
  { key: "ivory", name: "Classic ivory", colors: { text: "#111111", brand: "#111111", accent: "#8c6a43", background: "#f7f3ec" }, heading_font: "cormorant", body_font: "jost", heading_italic: false },
];

/**
 * The store's colours and heading style. brand_color and heading_italic are missing until
 * the theme migration (20261023000100) runs; until then a store on the original palette
 * already shows the new default, exactly as the migration will set it.
 */
export function themeOf(s: Pick<StoreSettings, "primary_color" | "accent_color" | "background_color"> & { brand_color?: string | null; heading_italic?: boolean | null }): { colors: ThemeColors; italic: boolean } {
  const original = [s.primary_color, s.accent_color, s.background_color].map((c) => c.toLowerCase()).join() === "#111111,#8c6a43,#f7f3ec";
  if (s.brand_color == null && original) return { colors: { ...THEME_PRESETS[0].colors }, italic: true };
  return {
    colors: { text: s.primary_color, brand: s.brand_color ?? s.primary_color, accent: s.accent_color, background: s.background_color },
    italic: s.heading_italic ?? true,
  };
}

// --- Colour arithmetic --------------------------------------------------------------------
// Mixing happens in OKLab, where equal steps look equal; contrast is WCAG 2's ratio.

type Triple = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function parse(hex: string): Triple {
  const n = parseInt(hex.slice(1, 7), 16);
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255)];
}

function format(rgb: Triple) {
  return `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, fromLinear(c))) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function toLab([r, g, b]: Triple): Triple {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromLab([L, a, b]: Triple): Triple {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export const isHexColor = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/** a and b mixed in OKLab: t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number) {
  const x = toLab(parse(a));
  const y = toLab(parse(b));
  return format(fromLab([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]));
}

export function luminance(hex: string) {
  const [r, g, b] = parse(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, from 1 (none) to 21 (black on white). */
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/** fg, darkened (or lightened on a dark ground) just enough to reach `min` against bg. */
export function readable(fg: string, bg: string, min = 4.5) {
  if (contrast(fg, bg) >= min) return fg.toLowerCase();
  const toward = luminance(bg) > 0.18 ? "#000000" : "#ffffff";
  for (let i = 1; i < 20; i++) {
    const c = mix(fg, toward, i / 20);
    if (contrast(c, bg) >= min) return c;
  }
  return toward;
}

/** The colour for words on a brand-coloured button or band. */
export function onColor(fill: string, c: ThemeColors) {
  const candidates = [c.background, "#ffffff", c.text, "#000000"];
  return candidates.find((x) => contrast(x, fill) >= 4.5) ?? candidates.sort((x, y) => contrast(y, fill) - contrast(x, fill))[0];
}

/** Every colour token the storefront uses, as CSS custom properties. */
export function themeTokens(c: ThemeColors): Record<string, string> {
  const light = luminance(c.background) > 0.18;
  const bone = mix(c.background, c.accent, light ? 0.09 : 0.14);
  const sand = mix(c.background, c.accent, light ? 0.18 : 0.24);
  const onBrand = onColor(c.brand, c);
  // Quieter words on the brand colour (footer links): as soft as stays readable.
  const onBrandSoft = [0.3, 0.25, 0.2, 0.15, 0.1, 0.05].map((t) => mix(onBrand, c.brand, t)).find((x) => contrast(x, c.brand) >= 4.5) ?? onBrand;
  return {
    "--color-ink": c.text,
    "--color-brand": c.brand,
    "--color-on-brand": onBrand,
    "--color-on-brand-soft": onBrandSoft,
    "--color-accent": readable(c.accent, sand),
    "--color-ivory": c.background,
    "--color-paper": light ? mix(c.background, "#ffffff", 0.5) : mix(c.background, c.text, 0.05),
    "--color-bone": bone,
    "--color-sand": sand,
    "--color-line": mix(mix(c.background, c.accent, 0.1), c.text, 0.08),
    "--color-taupe": readable(mix(c.text, c.background, 0.3), sand, 5),
    "--color-stone": readable(mix(c.text, c.background, 0.45), bone, 4.5),
  };
}

/** What would make the store hard to read with these colours, in words for the admin. */
export function themeWarnings(c: ThemeColors) {
  const out: string[] = [];
  if (contrast(c.text, c.background) < 4.5) out.push("Text is hard to read on this background. Pick a darker text colour or a lighter background.");
  if (contrast(c.brand, c.background) < 3) out.push("Buttons and bands barely stand out from the background. Pick a deeper button colour.");
  if (contrast(onColor(c.brand, c), c.brand) < 4.5) out.push("Words on buttons are hard to read. Pick a darker or lighter button colour.");
  return out;
}
