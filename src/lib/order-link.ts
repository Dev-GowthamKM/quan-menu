import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { LINK_SECRET } from "./server-env";

// Guests open their order through a link signed with a server secret, so nothing
// secret is stored with the order and links can be generated again at any time
// (for example when an email is sent).

export function orderKey(orderId: string) {
  if (!LINK_SECRET) throw new Error("ORDER_LINK_SECRET (or SUPABASE_SERVICE_ROLE_KEY) is not set.");
  return createHmac("sha256", LINK_SECRET).update(`order:${orderId}`).digest("base64url").slice(0, 32);
}

export function verifyOrderKey(orderId: string, key: string | null | undefined) {
  if (!key || !LINK_SECRET) return false;
  const expected = Buffer.from(orderKey(orderId));
  const given = Buffer.from(String(key));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function orderPath(orderNumber: string, orderId: string, extra = "") {
  return `/orders/${orderNumber}?key=${orderKey(orderId)}${extra}`;
}

/** The order's page on its store's own address (origin: storeOrigin(store)). */
export const orderUrl = (origin: string, orderNumber: string, orderId: string) => `${origin}${orderPath(orderNumber, orderId)}`;

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeNext(next: string | null | undefined, fallback = "/account") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
