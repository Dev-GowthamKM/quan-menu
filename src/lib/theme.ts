// Store colours and fonts. The admin picks four colours in Settings › Appearance: text,
// buttons and bands, accent and background. Everything else the storefront paints with
// (panels, borders, secondary text, the words on buttons, sale and error colours) is derived
// from those four here, with contrast checked, so any combination stays readable, on light
// backgrounds and dark ones.
import type { StoreSettings } from "./types";

export interface ThemeColors {
  text: string;
  brand: string;
  accent: string;
  background: string;
}

// --- Fonts ---------------------------------------------------------------------------------
// Loaded in app/fonts.ts (each as a CSS variable on <html>, downloaded only where used).

export const HEADING_FONT_KEYS = [
  "cormorant", "playfair", "bodoni", "dm-serif", "fraunces", "cinzel", "italiana", "marcellus",
  "syne", "space-grotesk", "unbounded", "bricolage", "archivo", "outfit", "josefin", "tenor",
] as const;
export const BODY_FONT_KEYS = ["jost", "inter", "manrope", "dm-sans", "karla", "work-sans", "figtree", "nunito", "lora", "outfit"] as const;
export type HeadingFont = (typeof HEADING_FONT_KEYS)[number];
export type BodyFont = (typeof BODY_FONT_KEYS)[number];

export interface FontInfo {
  label: string;
  /** The CSS variable app/fonts.ts declares. */
  css: string;
  kind: "serif" | "sans";
  /** Whether the face has a true italic (others would be slanted artificially). */
  italic: boolean;
  /** The weight headings are set in, chosen per face so none looks faint, and the range it has. */
  weight: number;
  min: number;
  max: number;
}

const font = (label: string, key: string, kind: FontInfo["kind"], italic: boolean, weight: number, min = weight, max = weight): FontInfo =>
  ({ label, css: `var(--font-${key})`, kind, italic, weight, min, max });

export const HEADING_FONTS: Record<HeadingFont, FontInfo> = {
  cormorant: font("Cormorant Garamond", "cormorant", "serif", true, 500, 400, 700),
  playfair: font("Playfair Display", "playfair", "serif", true, 500, 400, 900),
  bodoni: font("Bodoni Moda", "bodoni", "serif", true, 500, 400, 900),
  "dm-serif": font("DM Serif Display", "dm-serif", "serif", true, 400),
  fraunces: font("Fraunces", "fraunces", "serif", true, 500, 100, 900),
  cinzel: font("Cinzel", "cinzel", "serif", false, 500, 400, 900),
  italiana: font("Italiana", "italiana", "serif", false, 400),
  marcellus: font("Marcellus", "marcellus", "serif", false, 400),
  syne: font("Syne", "syne", "sans", false, 700, 400, 800),
  "space-grotesk": font("Space Grotesk", "space-grotesk", "sans", false, 500, 300, 700),
  unbounded: font("Unbounded", "unbounded", "sans", false, 600, 200, 900),
  bricolage: font("Bricolage Grotesque", "bricolage", "sans", false, 700, 200, 800),
  archivo: font("Archivo", "archivo", "sans", true, 800, 100, 900),
  outfit: font("Outfit", "outfit", "sans", false, 500, 100, 900),
  josefin: font("Josefin Sans", "josefin", "sans", true, 500, 100, 700),
  tenor: font("Tenor Sans", "tenor", "sans", false, 400),
};

export const BODY_FONTS: Record<BodyFont, FontInfo> = {
  jost: font("Jost", "jost", "sans", true, 400, 100, 900),
  inter: font("Inter", "inter", "sans", true, 400, 100, 900),
  manrope: font("Manrope", "manrope", "sans", false, 400, 200, 800),
  "dm-sans": font("DM Sans", "dm-sans", "sans", true, 400, 100, 1000),
  karla: font("Karla", "karla", "sans", true, 400, 200, 800),
  "work-sans": font("Work Sans", "work-sans", "sans", true, 400, 100, 900),
  figtree: font("Figtree", "figtree", "sans", true, 400, 300, 900),
  nunito: font("Nunito", "nunito", "sans", true, 400, 200, 1000),
  lora: font("Lora", "lora", "serif", true, 400, 400, 700),
  outfit: font("Outfit", "outfit", "sans", false, 400, 100, 900),
};

export const isHeadingFont = (k: unknown): k is HeadingFont => typeof k === "string" && k in HEADING_FONTS;
export const isBodyFont = (k: unknown): k is BodyFont => typeof k === "string" && k in BODY_FONTS;

/** A font's CSS stack, with fallbacks of the same kind while it loads. */
export function fontStack(f: FontInfo) {
  return f.kind === "serif"
    ? `${f.css}, Georgia, "Times New Roman", serif`
    : `${f.css}, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
}

// --- Palettes --------------------------------------------------------------------------------

export interface Palette {
  key: string;
  name: string;
  colors: ThemeColors;
}

const palette = (key: string, name: string, text: string, brand: string, accent: string, background: string): Palette =>
  ({ key, name, colors: { text, brand, accent, background } });

/**
 * One-click colours in Settings › Appearance, grouped by the design they were made for
 * (lib/designs.ts), though any palette works with any design. The first is the default.
 */
export const PALETTES: Palette[] = [
  // Editorial
  palette("wine", "Wine and gold", "#1f1416", "#6b1d2e", "#b07d2b", "#fbf6ee"),
  palette("indigo", "Indigo and saffron", "#121a2c", "#24366f", "#c8741c", "#f6f4ef"),
  palette("emerald", "Emerald and brass", "#132019", "#114a3a", "#a8843f", "#f5f2e9"),
  palette("rose", "Rose and copper", "#2a1519", "#a3324f", "#b9713f", "#fdf5f3"),
  palette("noir", "Black and white", "#0d0d0d", "#0d0d0d", "#94733a", "#ffffff"),
  palette("ivory", "Classic ivory", "#111111", "#111111", "#8c6a43", "#f7f3ec"),
  // Minimal
  palette("snow", "Snow and charcoal", "#1c1c1c", "#1c1c1c", "#6e6e6e", "#ffffff"),
  palette("oat", "Oat and espresso", "#2a231e", "#3b2f27", "#8b7461", "#f3efe7"),
  palette("fog", "Fog and slate", "#1d272c", "#34495e", "#5d7a87", "#eef1f3"),
  palette("sage", "Sage and pine", "#1e2a21", "#3e5c47", "#7a8c68", "#f1f3ec"),
  palette("clay", "Clay and stone", "#2a1f1a", "#8c4a35", "#9c7864", "#f6efe8"),
  // Bold
  palette("tangerine", "Tangerine and cobalt", "#141414", "#e8400c", "#2340e8", "#fffaf2"),
  palette("bubblegum", "Pink and navy", "#1a1033", "#c2185b", "#3730a3", "#fff5fa"),
  palette("cobalt", "Cobalt and sun", "#0d1440", "#1f3fe0", "#c2410c", "#f3f5ff"),
  palette("cherry", "Cherry and teal", "#1f0f0f", "#d7263d", "#1b998b", "#fff8ef"),
  palette("acid", "Acid lime on black", "#f4f4ef", "#c6f135", "#c6f135", "#121212"),
  // Soft
  palette("blush", "Blush and berry", "#2e1a1f", "#a8495f", "#c0806b", "#fff6f3"),
  palette("lavender", "Lavender and plum", "#231a35", "#6b4fa3", "#8e6cc0", "#f8f5ff"),
  palette("mint", "Mint and forest", "#142a21", "#2a7356", "#4f9a7c", "#f1faf5"),
  palette("butter", "Butter and cinnamon", "#2d2214", "#9a4f26", "#b8862f", "#fffaea"),
  palette("sky", "Sky and navy", "#14213d", "#2f5f93", "#d0694e", "#f3f8fd"),
  // Traditional
  palette("maharani", "Maroon and gold", "#2b1210", "#7b1e24", "#b8860b", "#fbf4e6"),
  palette("peacock", "Peacock and brass", "#0f2a2e", "#0e5560", "#a97b2c", "#f2f6f0"),
  palette("marigold", "Marigold and rust", "#2e1606", "#9c3510", "#c98411", "#fff7e8"),
  palette("temple", "Temple brown and gold", "#2a1d14", "#4a2c1d", "#a8742a", "#f6efe3"),
  palette("royal", "Royal blue and antique gold", "#141a33", "#1f2b6e", "#9a7b3c", "#f4f4f8"),
  // Dark
  palette("onyx", "Onyx and champagne", "#f3efe8", "#f3efe8", "#c9a96e", "#0f0f0f"),
  palette("midnight", "Midnight and gold", "#eef0f6", "#d9b45a", "#d9b45a", "#0e1322"),
  palette("bordeaux", "Bordeaux night", "#f5ecec", "#c43c58", "#e0a76b", "#160c0f"),
  palette("graphite", "Graphite and ice", "#ececec", "#a8cbdb", "#a8cbdb", "#1a1b1e"),
  // Cinematic, light
  palette("linen", "Linen and ink", "#23201c", "#23201c", "#9b7b5a", "#f7f4ef"),
  palette("stone", "Stone and smoke", "#2a2925", "#4a463f", "#8a8172", "#eeece6"),
  palette("sandstone", "Sandstone and walnut", "#2b211a", "#6e4f39", "#b08a62", "#f5eee5"),
  palette("mist", "Mist and slate", "#1f2629", "#3f5560", "#8aa0a8", "#f1f4f4"),
  // Neon, dark
  palette("ultraviolet", "Ultraviolet", "#f6f1ff", "#b14dff", "#ff5ccf", "#0b0713"),
  palette("cyber", "Electric blue", "#eef6ff", "#2f80ff", "#22d3ee", "#050a14"),
  palette("magma", "Magma", "#fff3ec", "#ff5a1f", "#ffb020", "#110705"),
  palette("toxic", "Acid green", "#f2ffe8", "#9dff3b", "#3bffd2", "#070b06"),
];

export const paletteByKey = (key: string) => PALETTES.find((p) => p.key === key);

const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The palette these colours come from, if they're one of the ready-made ones. */
export function paletteOf(c: ThemeColors) {
  return PALETTES.find((p) => sameColor(p.colors.text, c.text) && sameColor(p.colors.brand, c.brand) && sameColor(p.colors.accent, c.accent) && sameColor(p.colors.background, c.background));
}

/**
 * The store's colours and heading style. brand_color and heading_italic are missing until
 * the theme migration (20261023000100) runs; until then a store on the original palette
 * already shows the new default, exactly as the migration will set it.
 */
export function themeOf(s: Pick<StoreSettings, "primary_color" | "accent_color" | "background_color"> & { brand_color?: string | null; heading_italic?: boolean | null }): { colors: ThemeColors; italic: boolean } {
  const original = [s.primary_color, s.accent_color, s.background_color].map((c) => c.toLowerCase()).join() === "#111111,#8c6a43,#f7f3ec";
  if (s.brand_color == null && original) return { colors: { ...PALETTES[0].colors }, italic: true };
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

/** Whether the background is light (dark words on it) or dark (light words). */
export const isLight = (c: ThemeColors) => luminance(c.background) > 0.18;

/** fg, adjusted just enough to reach `min` against every one of the surfaces. */
function readableOnAll(fg: string, surfaces: string[], min = 4.5) {
  let c = fg.toLowerCase();
  for (const s of surfaces) c = readable(c, s, min);
  // Darkening for one surface can't undo another on the same side of the scale, but check.
  return surfaces.every((s) => contrast(c, s) >= min) ? c : readable(c, surfaces[0], min);
}

const SALE = "#9b2c2c";
const OK = "#2f6b4f";
const WARN = "#9a6200";

/** Every colour token the storefront uses, as CSS custom properties. */
export function themeTokens(c: ThemeColors): Record<string, string> {
  const light = isLight(c);
  const bone = mix(c.background, c.accent, light ? 0.09 : 0.14);
  const sand = mix(c.background, c.accent, light ? 0.18 : 0.24);
  const paper = light ? mix(c.background, "#ffffff", 0.5) : mix(c.background, c.text, 0.05);
  const surfaces = [c.background, paper, bone, sand];
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
    "--color-paper": paper,
    "--color-bone": bone,
    "--color-sand": sand,
    "--color-line": mix(mix(c.background, c.accent, 0.1), c.text, 0.08),
    "--color-taupe": readable(mix(c.text, c.background, 0.3), sand, 5),
    "--color-stone": readable(mix(c.text, c.background, 0.45), bone, 4.5),
    // Sale prices, errors and confirmations as text, readable on every surface (lighter on dark backgrounds).
    "--color-sale": readableOnAll(SALE, surfaces),
    "--color-ok": readableOnAll(OK, surfaces),
    "--color-warn": readableOnAll(WARN, surfaces),
    // Form fields: white on light backgrounds, a lifted panel on dark ones.
    "--color-field": light ? "#ffffff" : mix(c.background, c.text, 0.08),
  };
}

/**
 * Backgrounds for chapters the shopper scrolls through (the Spotlight section): the page's
 * own, then deepening toward the accent and brand colours, each keeping text, secondary text
 * and accent labels readable.
 */
export function chapterColors(c: ThemeColors, count: number): string[] {
  const t = themeTokens(c);
  const steps: [string, number][] = isLight(c)
    ? [[c.background, 0], [c.accent, 0.14], [c.brand, 0.1], [c.accent, 0.24]]
    : [[c.background, 0], [c.brand, 0.22], [c.accent, 0.16], [c.brand, 0.32]];
  return Array.from({ length: count }, (_, i) => {
    const [toward, amount] = steps[i % steps.length];
    for (let a = amount; a > 0; a -= 0.02) {
      const bg = mix(c.background, toward, a);
      if (contrast(c.text, bg) >= 7 && contrast(t["--color-taupe"], bg) >= 4.5 && contrast(t["--color-accent"], bg) >= 4.5) return bg;
    }
    return c.background.toLowerCase();
  });
}

/** What would make the store hard to read with these colours, in words for the admin. */
export function themeWarnings(c: ThemeColors) {
  const out: string[] = [];
  if (contrast(c.text, c.background) < 4.5) out.push("Text is hard to read on this background. Pick a darker text colour or a lighter background.");
  if (contrast(c.brand, c.background) < 3) out.push("Buttons and bands barely stand out from the background. Pick a deeper button colour.");
  if (contrast(onColor(c.brand, c), c.brand) < 4.5) out.push("Words on buttons are hard to read. Pick a darker or lighter button colour.");
  return out;
}
