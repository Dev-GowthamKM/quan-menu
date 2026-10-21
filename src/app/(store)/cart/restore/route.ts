import { NextResponse } from "next/server";
import { cartIdentity, ensureGuestToken } from "@/lib/cart-session";
import { sqlNull } from "@/lib/db";
import { SITE_URL } from "@/lib/env";
import { verifyCartRestore } from "@/lib/signed-links";
import { supabaseService } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** "Return to your bag" from a reminder email: copies that bag's items into this visitor's bag. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cartId = url.searchParams.get("c") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(cartId) || !verifyCartRestore(cartId, url.searchParams.get("s"))) {
    return NextResponse.redirect(`${SITE_URL}/cart`);
  }
  const id = await cartIdentity();
  const token = id.userId ? null : await ensureGuestToken();
  const { data, error } = await supabaseService().rpc("cart_restore", { p_from_cart: cartId, p_user_id: sqlNull(id.userId), p_token: sqlNull(token) });
  if (error) console.error("[cart] restore:", error.message);
  return NextResponse.redirect(`${SITE_URL}/cart${data ? "?restored=1" : ""}`);
}
