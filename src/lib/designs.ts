// Store designs. A design is how a store is built and how it behaves: its header and menu,
// homepage layout, product cards, section titles, buttons, product photos and footer, and
// the colours and fonts that suit it. The colours and fonts stay the store's own choice
// (lib/theme.ts); a design suggests them. Every store picks one, and can mix in a few parts
// of another (DesignOptions), so no two stores need to look alike.
import {
  BODY_FONTS,
  HEADING_FONTS,
  isBodyFont,
  isHeadingFont,
  paletteByKey,
  PALETTES,
  type BodyFont,
  type HeadingFont,
  type ThemeColors,
} from "./theme";

export const DESIGN_KEYS = ["atelier", "nordic", "bazaar", "boutique", "heritage", "noir", "cinema", "neon"] as const;
export type DesignKey = (typeof DESIGN_KEYS)[number];

export const HEADER_STYLES = ["classic", "inline", "bold", "centered", "heritage", "overlay", "floating", "glass"] as const;
export const HERO_STYLES = ["split", "full", "type", "framed", "arch", "cinema", "film", "glow"] as const;
export const CARD_STYLES = ["classic", "minimal", "sticker", "soft", "framed", "overlay", "gallery", "glow"] as const;
export const CORNER_STYLES = ["sharp", "soft", "round"] as const;
export const BUTTON_STYLES = ["square", "soft", "pill"] as const;
/** How much the store moves: not at all, sections easing in as they scroll into view, or that plus parallax and scroll-driven scenes. */
export const MOTION_STYLES = ["none", "subtle", "cinematic"] as const;
export type HeaderStyle = (typeof HEADER_STYLES)[number];
export type HeroStyle = (typeof HERO_STYLES)[number];
export type CardStyle = (typeof CARD_STYLES)[number];
export type CornerStyle = (typeof CORNER_STYLES)[number];
export type ButtonStyle = (typeof BUTTON_STYLES)[number];
export type MotionStyle = (typeof MOTION_STYLES)[number];
export type DepartmentStyle = "tiles" | "list" | "chips" | "circles" | "arches" | "mosaic" | "panels" | "lineup";
export type TitleStyle = "editorial" | "minimal" | "bold" | "soft" | "ornament" | "giant" | "statement" | "glow";
export type FooterStyle = "columns" | "minimal" | "bold" | "soft" | "heritage" | "wordmark" | "grand" | "neon";
export type AnnouncementStyle = "band" | "slim" | "marquee";
export type GalleryStyle = "thumbs" | "stack" | "grid";

/** Homepage sections, in the order a design shows them unless the store reorders them. */
export const SECTION_KEYS = ["hero", "trust", "departments", "new", "promos", "best", "seasonal", "collections", "brands", "campaign", "spotlight", "statement", "story", "recommended", "newsletter"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  hero: "Main banner",
  trust: "Delivery, returns and payment promises",
  departments: "Departments",
  new: "New arrivals",
  promos: "Promotion tiles",
  best: "Best sellers (or your featured edit)",
  seasonal: "Seasonal collection",
  collections: "Featured collections",
  brands: "Featured brands",
  campaign: "Second banner",
  spotlight: "Spotlight: your collections, one by one as you scroll",
  statement: "Statement: big words with a photo (the second banner, or your tagline)",
  story: "Your story (from Policies › About)",
  recommended: "Recommended for each shopper",
  newsletter: "Newsletter sign-up",
};

export interface Design {
  key: DesignKey;
  name: string;
  /** One line for the admin's gallery. */
  summary: string;
  header: HeaderStyle;
  hero: HeroStyle;
  card: CardStyle;
  corners: CornerStyle;
  buttons: ButtonStyle;
  departments: DepartmentStyle;
  title: TitleStyle;
  footer: FooterStyle;
  announcement: AnnouncementStyle;
  /** Product photos on wide screens: thumbnails beside one big image, all stacked, or a grid. */
  gallery: GalleryStyle;
  /** Shop filters beside the products on wide screens, or behind a button on every screen. */
  filters: "sidebar" | "drawer";
  /** Headings in capitals or as written, and how far apart their letters sit. */
  headingCase: "none" | "uppercase";
  headingTracking: string;
  /** Overrides the heading font's own weight, within what the font has. */
  headingWeight?: number;
  motion: MotionStyle;
  sections: SectionKey[];
  /** Palettes (lib/theme.ts) and fonts that suit the design; the first of each is its default. */
  palettes: string[];
  headings: HeadingFont[];
  bodies: BodyFont[];
  italic: boolean;
}

export const DESIGNS: Record<DesignKey, Design> = {
  atelier: {
    key: "atelier",
    name: "Atelier",
    summary: "Editorial and calm: a centred name, a large menu with pictures, big photographs and serif headlines.",
    header: "classic",
    hero: "split",
    card: "classic",
    corners: "sharp",
    buttons: "square",
    departments: "tiles",
    title: "editorial",
    footer: "columns",
    announcement: "band",
    gallery: "thumbs",
    filters: "sidebar",
    headingCase: "none",
    headingTracking: "normal",
    motion: "none",
    sections: ["hero", "departments", "new", "promos", "best", "seasonal", "collections", "brands", "campaign", "recommended", "newsletter"],
    palettes: ["wine", "indigo", "emerald", "rose", "ivory", "noir"],
    headings: ["cormorant", "playfair", "bodoni", "dm-serif", "fraunces"],
    bodies: ["jost", "manrope", "inter", "dm-sans"],
    italic: true,
  },
  nordic: {
    key: "nordic",
    name: "Nordic",
    summary: "Minimal and airy: a slim header that tucks away as you scroll, full-width photographs, small type and lots of white space.",
    header: "inline",
    hero: "full",
    card: "minimal",
    corners: "sharp",
    buttons: "square",
    departments: "list",
    title: "minimal",
    footer: "minimal",
    announcement: "slim",
    gallery: "stack",
    filters: "drawer",
    headingCase: "none",
    headingTracking: "-0.01em",
    headingWeight: 500,
    motion: "subtle",
    sections: ["hero", "new", "departments", "seasonal", "best", "collections", "campaign", "recommended", "newsletter"],
    palettes: ["snow", "oat", "fog", "sage", "clay"],
    headings: ["space-grotesk", "outfit", "tenor", "josefin", "italiana"],
    bodies: ["inter", "manrope", "work-sans", "karla", "figtree"],
    italic: false,
  },
  bazaar: {
    key: "bazaar",
    name: "Bazaar",
    summary: "Bold and playful: a scrolling announcement, category chips under the header, chunky capitals and rounded, outlined cards.",
    header: "bold",
    hero: "type",
    card: "sticker",
    corners: "round",
    buttons: "pill",
    departments: "chips",
    title: "bold",
    footer: "bold",
    announcement: "marquee",
    gallery: "grid",
    filters: "sidebar",
    headingCase: "uppercase",
    headingTracking: "-0.01em",
    headingWeight: 800,
    motion: "subtle",
    sections: ["hero", "departments", "trust", "best", "promos", "new", "collections", "brands", "recommended", "newsletter"],
    palettes: ["tangerine", "bubblegum", "cobalt", "cherry", "acid"],
    headings: ["unbounded", "bricolage", "archivo", "syne"],
    bodies: ["dm-sans", "figtree", "work-sans", "karla", "outfit"],
    italic: false,
  },
  boutique: {
    key: "boutique",
    name: "Boutique",
    summary: "Soft and friendly: rounded shapes, round category bubbles like stories, pastel colours and gentle italics.",
    header: "centered",
    hero: "framed",
    card: "soft",
    corners: "round",
    buttons: "pill",
    departments: "circles",
    title: "soft",
    footer: "soft",
    announcement: "band",
    gallery: "thumbs",
    filters: "sidebar",
    headingCase: "none",
    headingTracking: "normal",
    motion: "subtle",
    sections: ["hero", "departments", "new", "promos", "best", "collections", "campaign", "trust", "recommended", "newsletter"],
    palettes: ["blush", "lavender", "mint", "butter", "sky"],
    headings: ["fraunces", "dm-serif", "playfair", "josefin"],
    bodies: ["nunito", "dm-sans", "figtree", "karla"],
    italic: true,
  },
  heritage: {
    key: "heritage",
    name: "Heritage",
    summary: "Rich and traditional: arched frames, ornaments, jewel tones and classical capitals, made for festive and handloom wear.",
    header: "heritage",
    hero: "arch",
    card: "framed",
    corners: "soft",
    buttons: "soft",
    departments: "arches",
    title: "ornament",
    footer: "heritage",
    announcement: "band",
    gallery: "thumbs",
    filters: "sidebar",
    headingCase: "uppercase",
    headingTracking: "0.06em",
    motion: "subtle",
    sections: ["hero", "trust", "departments", "best", "story", "collections", "promos", "brands", "seasonal", "newsletter"],
    palettes: ["maharani", "peacock", "marigold", "temple", "royal"],
    headings: ["cinzel", "marcellus", "cormorant", "playfair"],
    bodies: ["lora", "jost", "manrope", "karla"],
    italic: false,
  },
  noir: {
    key: "noir",
    name: "Noir",
    summary: "Dark and dramatic: a see-through header over full-screen photographs, light words on black and wide capitals.",
    header: "overlay",
    hero: "cinema",
    card: "overlay",
    corners: "sharp",
    buttons: "square",
    departments: "mosaic",
    title: "giant",
    footer: "wordmark",
    announcement: "slim",
    gallery: "stack",
    filters: "drawer",
    headingCase: "uppercase",
    headingTracking: "0.05em",
    headingWeight: 400,
    motion: "cinematic",
    sections: ["hero", "new", "departments", "seasonal", "campaign", "collections", "best", "recommended", "newsletter"],
    palettes: ["onyx", "midnight", "bordeaux", "graphite"],
    headings: ["italiana", "bodoni", "syne", "tenor", "cinzel"],
    bodies: ["inter", "manrope", "work-sans", "figtree"],
    italic: false,
  },
  cinema: {
    key: "cinema",
    name: "Cinema",
    summary: "Cinematic and calm: a floating header, a full-screen film or photo, sections that drift in as you scroll, a pinned story and big serif lines.",
    header: "floating",
    hero: "film",
    card: "gallery",
    corners: "soft",
    buttons: "pill",
    departments: "panels",
    title: "statement",
    footer: "grand",
    announcement: "slim",
    gallery: "stack",
    filters: "drawer",
    headingCase: "none",
    headingTracking: "-0.01em",
    motion: "cinematic",
    sections: ["hero", "statement", "spotlight", "new", "departments", "best", "story", "recommended"],
    palettes: ["linen", "stone", "sandstone", "mist"],
    headings: ["bodoni", "cormorant", "italiana", "fraunces"],
    bodies: ["inter", "manrope", "figtree", "work-sans"],
    italic: true,
  },
  neon: {
    key: "neon",
    name: "Neon",
    summary: "Electric and bold: a glass header, products glowing on dark backgrounds, giant words behind them and colours that change as you scroll.",
    header: "glass",
    hero: "glow",
    card: "glow",
    corners: "round",
    buttons: "pill",
    departments: "lineup",
    title: "glow",
    footer: "neon",
    announcement: "marquee",
    gallery: "grid",
    filters: "drawer",
    headingCase: "uppercase",
    headingTracking: "-0.01em",
    headingWeight: 800,
    motion: "cinematic",
    sections: ["hero", "spotlight", "best", "departments", "statement", "new", "brands", "recommended"],
    palettes: ["ultraviolet", "cyber", "magma", "toxic"],
    headings: ["archivo", "unbounded", "syne", "bricolage"],
    bodies: ["inter", "dm-sans", "figtree", "outfit"],
    italic: false,
  },
};

export const DESIGN_LIST: Design[] = DESIGN_KEYS.map((k) => DESIGNS[k]);
export const isDesignKey = (k: unknown): k is DesignKey => typeof k === "string" && (DESIGN_KEYS as readonly string[]).includes(k);

/** Parts of another design a store mixes into its own. */
export interface DesignOptions {
  header?: HeaderStyle;
  hero?: HeroStyle;
  card?: CardStyle;
  corners?: CornerStyle;
  buttons?: ButtonStyle;
  motion?: MotionStyle;
}

export const OPTION_CHOICES = {
  header: HEADER_STYLES,
  hero: HERO_STYLES,
  card: CARD_STYLES,
  corners: CORNER_STYLES,
  buttons: BUTTON_STYLES,
  motion: MOTION_STYLES,
} as const;

export const OPTION_LABELS: { [K in keyof DesignOptions]-?: { label: string; names: Record<NonNullable<DesignOptions[K]>, string> } } = {
  header: {
    label: "Header",
    names: {
      classic: "Centred name, large menu", inline: "Slim, name on the left", bold: "Search bar and category chips", centered: "Centred name, round menu",
      heritage: "Ornamented, with a contact bar", overlay: "See-through, menu button", floating: "Floating capsule", glass: "Dark glass with a shop button",
    },
  },
  hero: {
    label: "Main banner",
    names: {
      split: "Photo beside the words", full: "Full-width photo", type: "Big words and a photo collage", framed: "Rounded photo with a card",
      arch: "Arched photo", cinema: "Full-screen photo", film: "Full-screen film, centred title", glow: "Glowing product, giant words",
    },
  },
  card: {
    label: "Product cards",
    names: { classic: "Classic", minimal: "Minimal", sticker: "Outlined, with stickers", soft: "Soft and rounded", framed: "Framed", overlay: "Words on the photo", gallery: "Tall gallery prints", glow: "Glowing tiles" },
  },
  corners: { label: "Corners", names: { sharp: "Sharp", soft: "Softened", round: "Round" } },
  buttons: { label: "Buttons", names: { square: "Square", soft: "Softened", pill: "Pill" } },
  motion: { label: "Motion", names: { none: "Still", subtle: "Sections ease in", cinematic: "Cinematic: ease in, parallax and scenes" } },
};

/** Only the known options, with known values (the column is free-form JSON). */
export function parseOptions(raw: unknown): DesignOptions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DesignOptions = {};
  for (const k of Object.keys(OPTION_CHOICES) as (keyof DesignOptions)[]) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "string" && (OPTION_CHOICES[k] as readonly string[]).includes(v)) (out as Record<string, string>)[k] = v;
  }
  return out;
}

/** A design with the store's own mixed-in parts applied. */
export function resolveDesign(key: unknown, options?: unknown): Design {
  const base = DESIGNS[isDesignKey(key) ? key : "atelier"];
  return { ...base, ...parseOptions(options) };
}

/** Corner rounding and button shape as the storefront's radius tokens. */
export function radiusTokens(d: Pick<Design, "corners" | "buttons">): Record<string, string> {
  const r = { sharp: { card: "0px", img: "0px", field: "0px", badge: "0px" }, soft: { card: "8px", img: "6px", field: "6px", badge: "4px" }, round: { card: "20px", img: "16px", field: "12px", badge: "999px" } }[d.corners];
  return {
    "--radius-card": r.card,
    "--radius-img": r.img,
    "--radius-field": r.field,
    "--radius-badge": r.badge,
    "--radius-btn": { square: "0px", soft: "6px", pill: "999px" }[d.buttons],
  };
}

/** The weight a design sets a heading font in: its own preference, within what the font has. */
export function headingWeight(d: Pick<Design, "headingWeight">, f: HeadingFont) {
  const info = HEADING_FONTS[f];
  return Math.min(info.max, Math.max(info.min, d.headingWeight ?? info.weight));
}

// --- A store's whole look ----------------------------------------------------------------

/** Everything Settings › Appearance saves. */
export interface Look {
  design: DesignKey;
  colors: ThemeColors;
  heading_font: HeadingFont;
  body_font: BodyFont;
  heading_italic: boolean;
  options: DesignOptions;
}

/** A design's own look: its first palette and fonts. */
export function designLook(key: DesignKey, palette?: string): Look {
  const d = DESIGNS[key];
  const p = paletteByKey(palette ?? d.palettes[0]) ?? PALETTES[0];
  const heading = d.headings[0];
  return { design: key, colors: { ...p.colors }, heading_font: heading, body_font: d.bodies[0], heading_italic: d.italic && HEADING_FONTS[heading].italic, options: {} };
}

/** Another store's look, as far as telling looks apart goes. */
export interface TakenLook {
  design: string | null;
  brand: string | null;
  background: string | null;
  heading_font: string | null;
}

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();

/** The items used least often (by `count`), ties broken at random. */
function leastUsed<T>(items: readonly T[], count: (x: T) => number, random: () => number, slack = 0): T {
  const counts = items.map(count);
  const min = Math.min(...counts);
  const pool = items.filter((_, i) => counts[i] <= min + slack);
  return pool[Math.floor(random() * pool.length) % pool.length];
}

/**
 * A look no other store has, as far as possible: of the designs that still have a palette no
 * store uses, the one used by the fewest stores; then such a palette, and a heading font no
 * store with that design has yet. `avoid` (the look on screen) is skipped when there's
 * another choice, so "Shuffle" always shows something new.
 */
export function freshLook(taken: TakenLook[], random: () => number = Math.random, opts: { design?: DesignKey; avoid?: Look } = {}): Look {
  const paletteUse = (pk: string) => {
    const p = paletteByKey(pk)!;
    return taken.filter((t) => lower(t.brand) === lower(p.colors.brand) && lower(t.background) === lower(p.colors.background)).length;
  };
  const avoided = (pk: string) => (opts.avoid && lower(opts.avoid.colors.brand) === lower(paletteByKey(pk)!.colors.brand) ? 0.5 : 0);
  const designUse = (k: DesignKey) =>
    taken.filter((t) => t.design === k).length +
    (opts.avoid?.design === k ? 0.5 : 0) +
    (DESIGNS[k].palettes.some((pk) => paletteUse(pk) === 0) ? 0 : 100);
  const key = opts.design ?? leastUsed(DESIGN_KEYS, designUse, random);
  const d = DESIGNS[key];
  const sameDesign = taken.filter((t) => t.design === key);
  const p = paletteByKey(leastUsed(d.palettes, (pk) => paletteUse(pk) + avoided(pk), random))!;
  const heading = leastUsed(d.headings, (f) => sameDesign.filter((t) => t.heading_font === f).length + (opts.avoid?.heading_font === f ? 0.5 : 0), random);
  const body = d.bodies[Math.floor(random() * d.bodies.length) % d.bodies.length];
  return { design: key, colors: { ...p.colors }, heading_font: heading, body_font: body, heading_italic: d.italic && HEADING_FONTS[heading].italic, options: {} };
}

/** A store's saved look, from its settings (before the design update: Atelier). */
export function lookOfSettings(s: {
  design?: string | null;
  design_options?: unknown;
  heading_font: string;
  body_font: string;
}, colors: ThemeColors, italic: boolean): Look {
  const design = isDesignKey(s.design) ? s.design : "atelier";
  const heading_font = isHeadingFont(s.heading_font) ? s.heading_font : "cormorant";
  const body_font = isBodyFont(s.body_font) ? s.body_font : "jost";
  return { design, colors, heading_font, body_font, heading_italic: italic && HEADING_FONTS[heading_font].italic, options: parseOptions(s.design_options) };
}

/** A short description of a look, like "Bazaar · Pink and navy · Unbounded and DM Sans". */
export function describeLook(l: Look, paletteName?: string) {
  return [DESIGNS[l.design].name, paletteName, `${HEADING_FONTS[l.heading_font].label} and ${BODY_FONTS[l.body_font].label}`].filter(Boolean).join(" · ");
}

/** The homepage's sections in order: the store's own arrangement, or its design's. */
export function homeSections(design: Design, saved: unknown): SectionKey[] {
  if (!Array.isArray(saved) || !saved.length) return design.sections;
  const out: SectionKey[] = [];
  for (const item of saved) {
    const key = typeof item === "string" ? item : item && typeof item === "object" ? (item as { key?: unknown; on?: unknown }).key : null;
    const on = typeof item === "string" ? true : (item as { on?: unknown })?.on !== false;
    if (on && typeof key === "string" && (SECTION_KEYS as readonly string[]).includes(key) && !out.includes(key as SectionKey)) out.push(key as SectionKey);
  }
  return out;
}

/** A store's initials for its icon: "Kesar Studio" → "KS", "Taana" → "T". */
export function monogram(name: string) {
  const words = name.normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
  if (!words.length) return "S";
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0][0]).toUpperCase();
}
