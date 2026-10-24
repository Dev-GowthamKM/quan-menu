import type { MetadataRoute } from "next";
import { contextOrigin } from "@/lib/store";

/** Each store's robots.txt points at its own address and sitemap. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await contextOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private or per-visitor pages, and filter combinations that would only duplicate listings.
        disallow: ["/admin", "/account", "/cart", "/checkout", "/orders", "/api/", "/login", "/unsubscribe", "/signup", "/auth/", "/*?*sort="],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
