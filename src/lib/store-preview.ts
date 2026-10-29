import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { LINK_SECRET } from "./server-env";

// "Preview store": a store without a web address yet, shown at the site's main address to whoever
// opens the link its staff made from the admin. The link's signed token is kept in a cookie on
// that address (middleware.ts) for a day; it only chooses which store's storefront to show, so a
// leaked link shows nothing that store's own address wouldn't.

export const STORE_PREVIEW_COOKIE = "taana_store";
export const STORE_PREVIEW_SECONDS = 24 * 60 * 60;

function sign(payload: string) {
  if (!LINK_SECRET) throw new Error("ORDER_LINK_SECRET (or SUPABASE_SERVICE_ROLE_KEY) is not set.");
  return createHmac("sha256", LINK_SECRET).update(`store-preview:${payload}`).digest("base64url").slice(0, 32);
}

/** A token that shows `storeId`'s storefront at the site's main address, for a day. */
export function signStorePreview(storeId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ s: storeId, e: Math.floor(now / 1000) + STORE_PREVIEW_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The store a preview token is for, if the token is genuine and unexpired. */
export function readStorePreview(token: string | undefined, now = Date.now()): string | null {
  if (!token || !LINK_SECRET) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { s?: unknown; e?: unknown };
    if (typeof data.e !== "number" || data.e < now / 1000) return null;
    return typeof data.s === "string" && /^[0-9a-f-]{36}$/i.test(data.s) ? data.s : null;
  } catch {
    return null;
  }
}
