"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { AccessError, requireRole } from "@/lib/auth";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import type { AppRole } from "@/lib/types";

// Discounts, review moderation and customer messages.

async function role(needed: AppRole) {
  try {
    return await requireRole(needed);
  } catch (e) {
    if (e instanceof AccessError) return null;
    throw e;
  }
}

const couponSchema = z
  .object({
    id: z.string().uuid().nullable().optional(),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/, "Codes use 3–40 letters, numbers, dashes or underscores."),
    description: z.string().max(500).default(""),
    kind: z.enum(["percentage", "fixed", "free_shipping"]),
    value: z.number().int().min(0),
    max_discount: z.number().int().min(1).nullable(),
    min_subtotal: z.number().int().min(0),
    starts_at: z.string().datetime({ offset: true }).nullable(),
    ends_at: z.string().datetime({ offset: true }).nullable(),
    usage_limit: z.number().int().min(1).nullable(),
    usage_limit_per_customer: z.number().int().min(1).nullable(),
    first_order_only: z.boolean(),
    applies_to: z.enum(["all", "products", "categories", "collections"]),
    product_ids: z.array(z.string().uuid()).max(500),
    category_ids: z.array(z.string().uuid()).max(200),
    collection_ids: z.array(z.string().uuid()).max(200),
    customer_emails: z.array(z.string().trim().toLowerCase().email()).max(500),
    is_active: z.boolean(),
  })
  .refine((c) => c.kind !== "percentage" || (c.value >= 1 && c.value <= 10000), { message: "A percentage must be between 0.01% and 100%." })
  .refine((c) => c.kind !== "fixed" || c.value > 0, { message: "Enter the amount off." })
  .refine((c) => !c.starts_at || !c.ends_at || new Date(c.ends_at) > new Date(c.starts_at), { message: "The end must be after the start." });

export async function saveCoupon(input: z.input<typeof couponSchema>): Promise<ActionResult<{ id: string }>> {
  const ctx = await role("admin");
  if (!ctx) return fail("Only admins can change discounts.");
  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const { id, ...row } = parsed.data;
  const values = { ...row, value: row.kind === "free_shipping" ? 0 : row.value };
  const res = id
    ? await ctx.supabase.from("coupons").update(values).eq("id", id).select("id").single()
    : await ctx.supabase.from("coupons").insert(values).select("id").single();
  if (res.error) return fail(res.error.code === "23505" ? "Another discount already uses that code." : friendlyError(res.error));
  revalidatePath("/admin/discounts");
  return ok({ id: res.data.id }, "Discount saved.");
}

/** Deletes an unused code; codes that were used are switched off instead, to keep order history. */
export async function deleteCoupon(id: string): Promise<ActionResult<null>> {
  const ctx = await role("admin");
  if (!ctx) return fail("Only admins can change discounts.");
  const { count } = await ctx.supabase.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", id);
  if (count) {
    const { error } = await ctx.supabase.from("coupons").update({ is_active: false }).eq("id", id);
    if (error) return fail(friendlyError(error));
    revalidatePath("/admin/discounts");
    return ok(null, `This code was used on ${count} order${count === 1 ? "" : "s"}, so it was switched off instead of deleted.`);
  }
  const { error } = await ctx.supabase.from("coupons").delete().eq("id", id);
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin/discounts");
  return ok(null, "Discount deleted.");
}

export async function moderateReviews(ids: string[], action: "published" | "rejected" | "pending" | "delete"): Promise<ActionResult<null>> {
  const ctx = await role("staff");
  if (!ctx) return fail("Staff access required.");
  const list = ids.filter((x) => z.string().uuid().safeParse(x).success).slice(0, 200);
  if (!list.length) return fail("Choose reviews first.");
  const { error } =
    action === "delete"
      ? await ctx.supabase.from("product_reviews").delete().in("id", list)
      : await ctx.supabase.from("product_reviews").update({ status: action }).in("id", list);
  if (error) return fail(friendlyError(error));
  revalidateTag("reviews");
  revalidateTag("catalog");
  revalidatePath("/admin/reviews");
  return ok(null, action === "delete" ? "Deleted." : action === "published" ? "Published." : action === "rejected" ? "Rejected." : "Moved back to pending.");
}

export async function setMessageStatus(id: string, status: "new" | "open" | "closed"): Promise<ActionResult<null>> {
  const ctx = await role("staff");
  if (!ctx) return fail("Staff access required.");
  const { error } = await ctx.supabase.from("contact_messages").update({ status }).eq("id", id);
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin/messages");
  return ok(null, status === "closed" ? "Marked as done." : "Updated.");
}
