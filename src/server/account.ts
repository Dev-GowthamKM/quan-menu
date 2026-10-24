"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { contextStoreId, storeService } from "@/lib/store";
import { supabaseService } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

const uuid = z.string().uuid();

export async function toggleWishlist(productId: string): Promise<ActionResult<{ saved: boolean }>> {
  if (!uuid.safeParse(productId).success) return fail("Unknown product.");
  const user = await getUser();
  if (!user) return fail("SIGN_IN");
  const { data, error } = await (await supabaseServer()).rpc("toggle_wishlist", { p_product_id: productId });
  if (error) return fail(friendlyError(error));
  revalidatePath("/account/wishlist");
  return ok({ saved: !!data });
}

const profileSchema = z.object({
  full_name: z.string().trim().max(120),
  phone: z.string().trim().max(20).refine((v) => v === "" || /^\+?[0-9][0-9 ()-]{6,19}$/.test(v), "Enter a valid phone number."),
  marketing_opt_in: z.boolean(),
});

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ActionResult<null>> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const user = await getUser();
  if (!user) return fail("Please sign in again.");
  const sb = await supabaseServer();
  const { error } = await sb.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return fail(friendlyError(error));
  await sb.auth.updateUser({ data: { full_name: parsed.data.full_name } });
  revalidatePath("/account");
  return ok(null, "Profile saved.");
}

const addressSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  label: z.string().trim().max(40).default(""),
  full_name: z.string().trim().min(1, "Enter the recipient's name.").max(120),
  phone: z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,19}$/, "Enter a valid phone number."),
  line1: z.string().trim().min(1, "Enter the house number and street.").max(200),
  line2: z.string().trim().max(200).default(""),
  landmark: z.string().trim().max(120).default(""),
  city: z.string().trim().min(1, "Enter the city.").max(100),
  state: z.string().trim().min(1, "Choose the state.").max(100),
  postal_code: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code."),
  country: z.literal("IN").default("IN"),
  is_default: z.boolean().default(false),
});

export type AddressInput = z.input<typeof addressSchema>;

export async function saveAddress(input: AddressInput): Promise<ActionResult<{ id: string }>> {
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the address.");
  const user = await getUser();
  if (!user) return fail("Please sign in again.");
  const { id, ...fields } = parsed.data;
  const sb = await supabaseServer();
  const res = id
    ? await sb.from("customer_addresses").update(fields).eq("id", id).eq("user_id", user.id).select("id").single()
    : await sb.from("customer_addresses").insert({ ...fields, user_id: user.id }).select("id").single();
  if (res.error) return fail(friendlyError(res.error, "We couldn't save that address."));
  revalidatePath("/account/addresses");
  return ok({ id: res.data.id }, "Address saved.");
}

export async function deleteAddress(id: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(id).success) return fail("Unknown address.");
  const user = await getUser();
  if (!user) return fail("Please sign in again.");
  const { error } = await (await supabaseServer()).from("customer_addresses").delete().eq("id", id).eq("user_id", user.id);
  if (error) return fail(friendlyError(error));
  revalidatePath("/account/addresses");
  return ok(null, "Address removed.");
}

export async function submitReview(productId: string, rating: number, title: string, body: string): Promise<ActionResult<{ status: string }>> {
  if (!uuid.safeParse(productId).success) return fail("Unknown product.");
  if (!(await rateLimit("review", 10, 3600))) return fail("Too many reviews in a short time. Please try later.");
  const { data, error } = await (await supabaseServer()).rpc("submit_review", {
    p_product_id: productId,
    p_rating: Math.round(rating),
    p_title: title.slice(0, 120),
    p_body: body.slice(0, 3000),
  });
  if (error) return fail(friendlyError(error, "We couldn't post your review."));
  const status = (data as { status: string }).status;
  return ok({ status }, status === "published" ? "Thanks! Your review is live." : "Thanks! Your review will appear once it has been checked.");
}

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export async function subscribeNewsletter(email: string, source = "footer"): Promise<ActionResult<null>> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return fail("Enter a valid email address.");
  if (!(await rateLimit("newsletter", 5, 600))) return fail("Too many attempts. Please try again later.");
  const store = await contextStoreId();
  const { error } = await supabaseService(store)
    .from("newsletter_subscribers")
    .upsert(
      { ...(store ? { store_id: store } : {}), email: parsed.data, source: source.slice(0, 40), unsubscribed_at: null },
      { onConflict: store ? "store_id,email" : "email" },
    );
  if (error) {
    console.error("[newsletter]", error.message);
    return fail("We couldn't sign you up just now. Please try again.");
  }
  return ok(null, "You're on the list. Welcome!");
}

const contactSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: emailSchema,
  order_number: z.string().trim().max(40).default(""),
  subject: z.string().trim().max(200).default(""),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(5000),
});

export async function sendContactMessage(input: z.input<typeof contactSchema>): Promise<ActionResult<null>> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  if (!(await rateLimit("contact", 5, 3600))) return fail("You've sent several messages already. We'll be in touch soon.");
  const { error } = await (await storeService()).from("contact_messages").insert(parsed.data);
  if (error) {
    console.error("[contact]", error.message);
    return fail("We couldn't send your message. Please email us instead.");
  }
  return ok(null, "Thanks, we've got your message and will reply within one working day.");
}
