// Public configuration, safe for the browser. Secrets live in server-env.ts.

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
/** The anon (legacy JWT) or publishable key. Row-level security limits what it can do. */
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const SUPABASE_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/** The site's public address: canonical URLs, sitemap, emails and auth redirects. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** Razorpay's key id is public by design (it identifies the account to Checkout). */
export const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "";

/** Show "Continue with Google" only once the provider is set up in Supabase. */
export const GOOGLE_SIGN_IN = process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN === "1";

export const CATALOG_BUCKET = "catalog";

/** Public URL of a file in the catalog bucket. */
export function storageUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/${CATALOG_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
