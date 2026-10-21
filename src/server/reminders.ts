"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { cartIdentity } from "@/lib/cart-session";
import { sqlNull } from "@/lib/db";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { verifyUnsubscribe } from "@/lib/signed-links";
import { supabaseService } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

const email = z.string().trim().toLowerCase().email().max(254);

/** "Notify me when it's back" for a sold-out size. */
export async function requestStockAlert(variantId: string, address: string): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(variantId).success) return fail("Choose a size.");
  const parsed = email.safeParse(address);
  if (!parsed.success) return fail("Enter a valid email address.");
  if (!(await rateLimit("stock-alert", 10, 600))) return fail("Too many requests. Please try again in a few minutes.");
  const user = await getUser();
  const { data, error } = await supabaseService().rpc("stock_alert_subscribe", {
    p_variant_id: variantId,
    p_email: parsed.data,
    p_user_id: sqlNull(user?.id ?? null),
  });
  if (error) return fail(friendlyError(error, "We couldn't save your request."));
  const r = data as { in_stock: boolean; size?: string; color?: string } | null;
  if (r?.in_stock) return fail("Good news: it's back in stock now. Choose it above.");
  const what = [r?.color, r?.size ? `size ${r.size}` : ""].filter(Boolean).join(", ");
  return ok(null, `We'll email ${parsed.data} when ${what || "it"} is back.`);
}

/** Checkout's contact step: remember the email on the bag, so a guest can get a reminder about it. */
export async function rememberCheckoutEmail(address: string): Promise<void> {
  const parsed = email.safeParse(address);
  if (!parsed.success) return;
  if (!(await rateLimit("checkout-contact", 30, 600))) return;
  const id = await cartIdentity();
  if (!id.userId && !id.token) return;
  await supabaseService().rpc("cart_set_contact", { p_user_id: sqlNull(id.userId), p_token: sqlNull(id.token), p_contact: { email: parsed.data } });
}

/** Wishlist price-drop emails on or off, for the signed-in customer. */
export async function setPriceAlerts(on: boolean): Promise<ActionResult<null>> {
  const user = await getUser();
  if (!user) return fail("Please sign in again.");
  const sb = await supabaseServer();
  const { error } = await sb.from("profiles").update({ price_alerts: !!on }).eq("id", user.id);
  if (error) return fail(friendlyError(error));
  if (on) await supabaseService().from("email_suppressions").delete().eq("email", (user.email ?? "").toLowerCase());
  revalidatePath("/account/wishlist");
  return ok(null, on ? "We'll email you when something on your wishlist drops in price." : "Price-drop emails are off.");
}

/** The unsubscribe link in reminder emails. */
export async function unsubscribe(address: string, signature: string): Promise<ActionResult<null>> {
  const parsed = email.safeParse(address);
  if (!parsed.success || !verifyUnsubscribe(parsed.data, signature)) return fail("This unsubscribe link isn't valid.");
  const { error } = await supabaseService().rpc("email_unsubscribe", { p_email: parsed.data });
  if (error) return fail(friendlyError(error));
  return ok(null, "You're unsubscribed from reminders.");
}
