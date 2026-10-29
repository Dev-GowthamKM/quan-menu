import { getSettings } from "@/lib/settings";
import { badgeSvg, storeBadge } from "@/lib/store-badge";
import { requestStore } from "@/lib/store";

// Each store's icon for browser tabs and bookmarks (lib/store-badge.ts); app-icon/[variant] draws
// the same badge for home screens.

export async function GET() {
  const store = await requestStore();
  return new Response(badgeSvg(storeBadge(await getSettings(store.id))), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
