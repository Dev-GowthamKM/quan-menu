import { lookOfSettings, monogram, resolveDesign, type Design } from "./designs";
import type { Settings } from "./settings";
import { HEADING_FONTS, onColor, themeOf } from "./theme";

/**
 * A store's badge, its icon everywhere (browser tabs, bookmarks, home screens, the offline
 * page): its initials in its own colours and corner shape, so every store is recognisable at a
 * glance.
 */
export interface StoreBadge {
  letters: string;
  fill: string;
  ink: string;
  corners: Design["corners"];
  serif: boolean;
  italic: boolean;
  /** The store's heading font (its Google Fonts name), in a weight that reads at icon size. */
  font: { family: string; weight: number };
}

export function storeBadge(s: Settings): StoreBadge {
  const { colors, italic } = themeOf(s);
  const look = lookOfSettings(s, colors, italic);
  const heading = HEADING_FONTS[look.heading_font];
  return {
    letters: monogram(s.store_name),
    fill: colors.brand,
    ink: onColor(colors.brand, colors),
    corners: resolveDesign(look.design, look.options).corners,
    serif: heading.kind === "serif",
    italic: look.heading_italic && heading.italic,
    font: { family: heading.label, weight: Math.min(heading.max, Math.max(heading.weight, 600)) },
  };
}

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

/** The badge as SVG, drawn on a 64-unit square. */
export function badgeSvg(b: StoreBadge, size?: number) {
  const font = b.serif ? "Georgia, 'Times New Roman', serif" : "'Helvetica Neue', Arial, sans-serif";
  const shape =
    b.corners === "round"
      ? `<circle cx="32" cy="32" r="32" fill="${b.fill}"/>`
      : `<rect width="64" height="64" rx="${b.corners === "soft" ? 14 : 3}" fill="${b.fill}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${size ? ` width="${size}" height="${size}"` : ""}>${shape}` +
    `<text x="32" y="34" text-anchor="middle" dominant-baseline="middle" font-family="${font}" font-size="${b.letters.length > 1 ? 27 : 38}" ` +
    `font-weight="700"${b.italic ? ' font-style="italic"' : ""} fill="${b.ink}">${escapeXml(b.letters)}</text></svg>`
  );
}

/** A store's name as it fits under an icon on a home screen (its first word when it's long). */
export function shortName(name: string) {
  const trimmed = name.trim();
  return trimmed.length <= 12 ? trimmed : trimmed.split(/\s+/)[0].slice(0, 12);
}
