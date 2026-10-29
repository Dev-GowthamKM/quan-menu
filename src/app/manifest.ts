import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";
import { requestStore } from "@/lib/store";
import { shortName } from "@/lib/store-badge";
import { themeOf } from "@/lib/theme";

// Each store installs as its own app (Add to Home Screen, Install): its name, colours and badge
// (app-icon/[variant]), opening on its home page, with shortcuts to the shop, the bag and orders.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const store = await requestStore();
  const s = await getSettings(store.id);
  const { colors } = themeOf(s);
  return {
    id: "/",
    name: s.store_name,
    short_name: shortName(s.store_name),
    description: s.tagline || s.seo_description || undefined,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: colors.background,
    theme_color: colors.background,
    categories: ["shopping"],
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Shop", url: "/shop" },
      { name: "Your bag", url: "/cart" },
      { name: "Your orders", url: "/account/orders" },
    ],
  };
}
