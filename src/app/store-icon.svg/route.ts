import { lookOfSettings, monogram, resolveDesign } from "@/lib/designs";
import { getSettings } from "@/lib/settings";
import { requestStore } from "@/lib/store";
import { HEADING_FONTS, onColor, themeOf } from "@/lib/theme";

// Each store's icon for browser tabs, bookmarks and home screens: its initials in its own
// colours and corner shape, so every store is recognisable at a glance.

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

export async function GET() {
  const store = await requestStore();
  const s = await getSettings(store.id);
  const { colors, italic } = themeOf(s);
  const look = lookOfSettings(s, colors, italic);
  const design = resolveDesign(look.design, look.options);
  const letters = monogram(s.store_name);
  const font = HEADING_FONTS[look.heading_font].kind === "serif" ? "Georgia, 'Times New Roman', serif" : "'Helvetica Neue', Arial, sans-serif";
  const shape =
    design.corners === "round"
      ? `<circle cx="32" cy="32" r="32" fill="${colors.brand}"/>`
      : `<rect width="64" height="64" rx="${design.corners === "soft" ? 14 : 3}" fill="${colors.brand}"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${shape}` +
    `<text x="32" y="34" text-anchor="middle" dominant-baseline="middle" font-family="${font}" font-size="${letters.length > 1 ? 27 : 38}" ` +
    `font-weight="700"${look.heading_italic ? ' font-style="italic"' : ""} fill="${onColor(colors.brand, colors)}">${escapeXml(letters)}</text></svg>`;
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
