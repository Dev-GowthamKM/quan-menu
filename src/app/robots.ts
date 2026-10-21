import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private or per-visitor pages, and filter combinations that would only duplicate listings.
        disallow: ["/admin", "/account", "/cart", "/checkout", "/orders", "/api/", "/login", "/unsubscribe", "/signup", "/auth/", "/*?*sort="],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
