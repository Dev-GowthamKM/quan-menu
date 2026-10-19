"use server";
import { cartIdentity, clearGuestToken, ensureGuestToken } from "@/lib/cart-session";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseService } from "@/lib/supabase/admin";
import { sqlNull } from "@/lib/db";
import type { Address, CartQuote } from "@/lib/types";

const isUuid = (s: unknown) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** The current cart, priced on the server (optionally for a delivery address). */
export async function getCart(opts: { address?: Partial<Address> | null; rateId?: string | null; paymentMethod?: string | null; email?: string | null } = {}): Promise<CartQuote> {
  const id = await cartIdentity();
  const { data, error } = await supabaseService().rpc("cart_get", {
    p_user_id: sqlNull(id.userId),
    p_token: sqlNull(id.token),
    p_address: opts.address ? (opts.address as never) : undefined,
    p_rate_id: isUuid(opts.rateId) ? opts.rateId! : undefined,
    p_payment_method: opts.paymentMethod ?? undefined,
    p_email: opts.email ?? undefined,
  });
  if (error) {
    console.error("[cart] get:", error.message);
    throw new Error(friendlyError(error, "We couldn't load your bag."));
  }
  return data as unknown as CartQuote;
}

async function setItem(variantId: string, quantity: number, mode: "add" | "set"): Promise<ActionResult<CartQuote>> {
  if (!isUuid(variantId) || !Number.isInteger(quantity) || quantity < 0 || quantity > 20) {
    return fail("Choose a size and quantity.");
  }
  if (!(await rateLimit("cart", 60, 60))) return fail("Too many changes at once. Please wait a moment.");
  const id = await cartIdentity();
  const token = id.userId ? null : mode === "add" ? await ensureGuestToken() : id.token;
  const { data, error } = await supabaseService().rpc("cart_set_item", {
    p_user_id: sqlNull(id.userId),
    p_token: sqlNull(token),
    p_variant_id: variantId,
    p_quantity: quantity,
    p_mode: mode,
  });
  if (error) return fail(friendlyError(error, "We couldn't update your bag."));
  return ok(data as unknown as CartQuote);
}

export async function addToCart(variantId: string, quantity = 1) {
  return setItem(variantId, quantity, "add");
}

export async function updateCartItem(variantId: string, quantity: number) {
  return setItem(variantId, quantity, "set");
}

export async function applyCoupon(code: string, email?: string | null): Promise<ActionResult<CartQuote>> {
  const clean = String(code || "").trim().toUpperCase().slice(0, 40);
  if (clean && !/^[A-Z0-9_-]{3,40}$/.test(clean)) return fail("That code doesn't look right.");
  if (!(await rateLimit("coupon", 20, 300))) return fail("Too many attempts. Please try again in a few minutes.");
  const id = await cartIdentity();
  const { data, error } = await supabaseService().rpc("cart_set_coupon", {
    p_user_id: sqlNull(id.userId),
    p_token: sqlNull(id.token),
    p_code: clean,
    p_email: email ?? undefined,
  });
  if (error) return fail(friendlyError(error, "We couldn't apply that code."));
  return ok(data as unknown as CartQuote);
}

/** After sign-in: move the guest bag into the customer's bag. */
export async function mergeGuestCart(): Promise<CartQuote | null> {
  const id = await cartIdentity();
  if (!id.userId || !id.guestToken) return null;
  const { data, error } = await supabaseService().rpc("cart_merge", { p_user_id: id.userId, p_token: id.guestToken });
  if (error) {
    console.error("[cart] merge:", error.message);
    return null;
  }
  await clearGuestToken();
  return data as unknown as CartQuote;
}
