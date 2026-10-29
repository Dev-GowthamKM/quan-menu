import { ImageResponse } from "next/og";
import { getSettings } from "@/lib/settings";
import { storeBadge, type StoreBadge } from "@/lib/store-badge";
import { requestStore } from "@/lib/store";

// The store's badge (lib/store-badge.ts) as PNG, for installing the store as an app
// (app/manifest.ts): 192 and 512 pixels in the store's own corner shape; a square "maskable" one
// for Android, which cuts its own shape (the letters stay inside its safe middle); and a 180-pixel
// square for iPhone home screens, which round the corners themselves.

const VARIANTS = {
  "192": { size: 192, square: false },
  "512": { size: 512, square: false },
  maskable: { size: 512, square: true },
  apple: { size: 180, square: true },
} as const;

type Weight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

/**
 * The store's heading font for just its initials, from Google Fonts (which sends a TrueType file to
 * a server, the format the image renderer reads). Without it the initials are drawn in a plain sans.
 */
async function badgeFont(b: StoreBadge) {
  const family = `${b.font.family.replace(/ /g, "+")}:${b.italic ? `ital,wght@1,${b.font.weight}` : `wght@${b.font.weight}`}`;
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(b.letters)}`, { signal: AbortSignal.timeout(3000) });
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(await css.text())?.[1];
    if (!css.ok || !url) return null;
    const file = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return file.ok ? await file.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  if (!Object.hasOwn(VARIANTS, variant)) return new Response("Not found", { status: 404 });
  const { size, square } = VARIANTS[variant as keyof typeof VARIANTS];
  const store = await requestStore();
  const badge = storeBadge(await getSettings(store.id));
  const font = await badgeFont(badge);
  const radius = square ? 0 : badge.corners === "round" ? size / 2 : badge.corners === "soft" ? size * 0.22 : size * 0.05;
  const two = badge.letters.length > 1;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: badge.fill,
          borderRadius: radius,
          color: badge.ink,
          fontFamily: font ? "Badge" : undefined,
          fontStyle: font && badge.italic ? "italic" : "normal",
          fontSize: size * (square ? (two ? 0.3 : 0.42) : two ? 0.4 : 0.56),
          fontWeight: font ? badge.font.weight : 700,
          letterSpacing: two ? size * -0.01 : 0,
        }}
      >
        {badge.letters}
      </div>
    ),
    {
      width: size,
      height: size,
      fonts: font ? [{ name: "Badge", data: font, weight: badge.font.weight as Weight, style: badge.italic ? "italic" : "normal" }] : undefined,
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
    },
  );
}
