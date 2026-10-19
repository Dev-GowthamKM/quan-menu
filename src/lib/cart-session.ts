import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getUser } from "./auth";

export const CART_COOKIE = "taana_cart";

/** Who the cart belongs to: the signed-in customer, or a guest's cart cookie. */
export async function cartIdentity() {
  const user = await getUser();
  const token = (await cookies()).get(CART_COOKIE)?.value ?? null;
  return { userId: user?.id ?? null, email: user?.email ?? null, token: user ? null : token, guestToken: token };
}

/** Creates the guest cart cookie if there isn't one (only from Server Actions). */
export async function ensureGuestToken() {
  const store = await cookies();
  let token = store.get(CART_COOKIE)?.value;
  if (!token || token.length < 32) {
    token = randomBytes(32).toString("base64url");
    store.set(CART_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 60,
    });
  }
  return token;
}

export async function clearGuestToken() {
  (await cookies()).delete(CART_COOKIE);
}
