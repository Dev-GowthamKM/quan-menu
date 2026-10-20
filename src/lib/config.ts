export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** Demo mode: no Supabase configured. No login; the vendor's menu lives in their browser. */
export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

export function slugify(s: string) {
  return (
    (s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "quan"
  );
}

export const DEMO_KEY = "quan-demo-menu";

/** Version of supabase/schema.sql this app needs (schema_version() there). Raise both together. */
export const SCHEMA_VERSION = 2;
