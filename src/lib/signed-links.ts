import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { LINK_SECRET } from "./server-env";

// Links in reminder emails, signed with the server secret so they can't be made up:
// unsubscribing an email address, and restoring a bag on another device. They point at
// the sending store's own address (origin), which is also the store they act on.

function sign(purpose: string, value: string) {
  if (!LINK_SECRET) throw new Error("ORDER_LINK_SECRET (or SUPABASE_SERVICE_ROLE_KEY) is not set.");
  return createHmac("sha256", LINK_SECRET).update(`${purpose}:${value}`).digest("base64url").slice(0, 32);
}

function verify(purpose: string, value: string, signature: string | null | undefined) {
  if (!signature || !LINK_SECRET) return false;
  const expected = Buffer.from(sign(purpose, value));
  const given = Buffer.from(String(signature));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const unsubscribeQuery = (email: string) => `e=${encodeURIComponent(email.toLowerCase())}&s=${sign("unsubscribe", email.toLowerCase())}`;
export const unsubscribeUrl = (origin: string, email: string) => `${origin}/unsubscribe?${unsubscribeQuery(email)}`;
/** One-click unsubscribe (RFC 8058), for the List-Unsubscribe header. */
export const oneClickUnsubscribeUrl = (origin: string, email: string) => `${origin}/api/unsubscribe?${unsubscribeQuery(email)}`;
export const verifyUnsubscribe = (email: string, signature: string | null | undefined) => verify("unsubscribe", email.toLowerCase(), signature);

export const cartRestoreUrl = (origin: string, cartId: string) => `${origin}/cart/restore?c=${cartId}&s=${sign("cart", cartId)}`;
export const verifyCartRestore = (cartId: string, signature: string | null | undefined) => verify("cart", cartId, signature);
