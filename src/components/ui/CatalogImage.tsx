"use client";
import Image, { type ImageLoaderProps, type ImageProps } from "next/image";
import { SUPABASE_URL } from "@/lib/env";

// Unsplash (used by the sample catalog) is an image CDN: ask it for the exact width
// instead of re-encoding through Next's optimizer.
function cdnLoader({ src, width, quality }: ImageLoaderProps) {
  const url = new URL(src);
  url.searchParams.set("w", String(width));
  url.searchParams.set("q", String(quality ?? 75));
  url.searchParams.set("auto", "format");
  return url.toString();
}

const supabaseHost = (() => {
  try {
    return SUPABASE_URL ? new URL(SUPABASE_URL).host : "";
  } catch {
    return "";
  }
})();

type Props = Omit<ImageProps, "src"> & { src: string | null | undefined };

/**
 * next/image for catalog pictures: responsive srcset, lazy loading and modern formats.
 * Uploaded files (Supabase Storage) go through Next's image optimizer; unknown hosts
 * are shown as-is rather than breaking the page.
 */
export default function CatalogImage({ src, alt, ...rest }: Props) {
  if (!src) {
    return <span aria-hidden className="block size-full bg-bone" />;
  }
  if (src.startsWith("https://images.unsplash.com/")) {
    return <Image src={src} alt={alt} loader={cdnLoader} {...rest} />;
  }
  let host = "";
  try {
    host = new URL(src, "http://local").host;
  } catch {
    host = "";
  }
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const optimizable = src.startsWith("/") || (host === supabaseHost && !local) || host.endsWith(".supabase.co");
  return <Image src={src} alt={alt} unoptimized={!optimizable} {...rest} />;
}
