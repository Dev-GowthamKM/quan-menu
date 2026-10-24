"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, requireRole } from "@/lib/auth";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { saveStoreSecret, secretsReady, SECRET_NAMES } from "@/lib/store-secrets";

// The store's own Razorpay account. Keys decide where customers' money goes, so only the
// store's owners can change them. They are encrypted before they're saved and never sent
// back to the browser: the settings page shows only their last four characters.

async function owner() {
  try {
    return await requireRole("owner");
  } catch (e) {
    if (e instanceof AccessError) return null;
    throw e;
  }
}

const keysSchema = z.object({
  keyId: z.string().trim().regex(/^$|^rzp_(test|live)_[A-Za-z0-9]{6,40}$/, "The key id starts with rzp_test_ or rzp_live_."),
  keySecret: z.string().trim().regex(/^$|^[A-Za-z0-9]{12,80}$/, "The key secret is the long code shown once when you made the key."),
  webhookSecret: z.string().trim().max(200).regex(/^[\x21-\x7e]*$/, "The webhook secret can't contain spaces."),
});

/** Saves the keys that were filled in; empty fields keep what is saved. */
export async function saveRazorpayKeys(input: z.input<typeof keysSchema>): Promise<ActionResult<null>> {
  const ctx = await owner();
  if (!ctx) return fail("Only the store's owners can change its payment account.");
  if (!ctx.store.id) return fail("Run the multi-store database update first (README › Updating).");
  if (!secretsReady()) return fail("Set STORE_SECRETS_KEY on the server first (README › Payment accounts).");
  const parsed = keysSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the keys.");
  const { keyId, keySecret, webhookSecret } = parsed.data;
  if (!keyId && !keySecret && !webhookSecret) return fail("Enter the keys to save.");
  const { data: saved } = await ctx.supabase.rpc("store_secret_status");
  const has = new Set((saved ?? []).map((s) => s.name));
  if ((keyId && !keySecret && !has.has("razorpay_key_secret")) || (keySecret && !keyId && !has.has("razorpay_key_id"))) {
    return fail("Enter both the key id and the key secret.");
  }
  try {
    if (keyId) await saveStoreSecret(ctx.store.id, "razorpay_key_id", keyId, ctx.user.id);
    if (keySecret) await saveStoreSecret(ctx.store.id, "razorpay_key_secret", keySecret, ctx.user.id);
    if (webhookSecret) await saveStoreSecret(ctx.store.id, "razorpay_webhook_secret", webhookSecret, ctx.user.id);
  } catch (e) {
    console.error("[payments] saving keys:", (e as Error).message);
    return fail("The keys couldn't be saved. Please try again.");
  }
  const { error } = await ctx.supabase.rpc("log_admin_action", {
    p_action: "payments.keys_saved",
    p_entity_type: "store",
    p_entity_id: ctx.store.id,
    p_details: { key_id: keyId ? `…${keyId.slice(-4)}` : null, key_secret: !!keySecret, webhook_secret: !!webhookSecret },
  });
  if (error) console.error("[payments] audit:", friendlyError(error));
  revalidatePath("/admin/settings");
  revalidatePath("/admin/payments");
  return ok(null, "Razorpay keys saved.");
}

/** Removes the store's own keys (the home store falls back to the server's environment keys). */
export async function removeRazorpayKeys(): Promise<ActionResult<null>> {
  const ctx = await owner();
  if (!ctx) return fail("Only the store's owners can change its payment account.");
  if (!ctx.store.id) return fail("Run the multi-store database update first (README › Updating).");
  try {
    for (const name of SECRET_NAMES) await saveStoreSecret(ctx.store.id, name, "", ctx.user.id);
  } catch (e) {
    console.error("[payments] removing keys:", (e as Error).message);
    return fail("The keys couldn't be removed. Please try again.");
  }
  await ctx.supabase.rpc("log_admin_action", { p_action: "payments.keys_removed", p_entity_type: "store", p_entity_id: ctx.store.id, p_details: {} });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/payments");
  return ok(null, "Razorpay keys removed.");
}
