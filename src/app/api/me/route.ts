import { NextResponse } from "next/server";
import { getRole, getUser } from "@/lib/auth";
import { cartIdentity } from "@/lib/cart-session";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { sqlNull } from "@/lib/db";
import { supabaseService } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Per-visitor bits of the storefront (signed-in state, bag count, wishlist), loaded by
 * the browser so every catalog page itself can be cached and shared.
 */
export async function GET() {
  if (!SUPABASE_CONFIGURED) return NextResponse.json({ user: null, role: null, cartCount: 0, wishlist: [] });
  const [user, role, id] = await Promise.all([getUser(), getRole(), cartIdentity()]);

  let cartCount = 0;
  if (id.userId || id.token) {
    const sb = supabaseService();
    const cart = await sb.rpc("cart_find", { p_user_id: sqlNull(id.userId), p_token: sqlNull(id.token), p_create: false });
    if (cart.data) {
      const { data } = await sb.from("cart_items").select("quantity").eq("cart_id", cart.data as string);
      cartCount = (data ?? []).reduce((n, r) => n + r.quantity, 0);
    }
  }

  let wishlist: string[] = [];
  if (user) {
    const { data } = await (await supabaseServer()).from("wishlist_items").select("product_id");
    wishlist = (data ?? []).map((r) => r.product_id);
  }

  return NextResponse.json(
    {
      user: user ? { email: user.email || "", name: (user.user_metadata?.full_name as string) || "" } : null,
      role,
      cartCount,
      wishlist,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
