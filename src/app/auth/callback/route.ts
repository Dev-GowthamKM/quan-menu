import { NextResponse, type NextRequest } from "next/server";
import { mergeGuestCart } from "@/server/cart";
import { safeNext } from "@/lib/order-link";
import { supabaseServer } from "@/lib/supabase/server";

/** OAuth (Google) sign-in returns here with a code to exchange for a session. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await mergeGuestCart();
      return NextResponse.redirect(new URL(next, url.origin));
    }
    console.error("[auth/callback]", error.message);
  }
  return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
}
