import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { mergeGuestCart } from "@/server/cart";
import { safeNext } from "@/lib/order-link";
import { supabaseServer } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["signup", "email", "recovery", "email_change", "magiclink", "invite"];

/**
 * Links in sign-up, password-reset and email-change emails land here. Verifying the
 * token hash (rather than a PKCE code) means the link works even when it is opened in a
 * different browser or on another phone.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"), type === "recovery" ? "/reset-password" : "/account");

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      await mergeGuestCart();
      return NextResponse.redirect(new URL(next, url.origin));
    }
    console.error("[auth/confirm]", error.message);
  }
  return NextResponse.redirect(new URL(`/login?error=link${type === "recovery" ? "&reset=1" : ""}`, url.origin));
}
