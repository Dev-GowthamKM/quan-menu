"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { AccessError, requireRole } from "@/lib/auth";
import { storageUrl } from "@/lib/env";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { authProviderStatus, msg91Configured } from "@/lib/login-codes";
import { SMS_HOOK_SECRET } from "@/lib/server-env";
import { SECTION_KEYS } from "@/lib/designs";
import { lookColumns, lookSchema, signLookPreview } from "@/lib/look";
import { storeOrigin } from "@/lib/store";
import { STORE_TYPES } from "@/lib/store-types";
import type { AppRole } from "@/lib/types";
import { whatsappConnected } from "@/lib/whatsapp";
import { WHATSAPP_EVENTS, type WhatsAppEvent } from "@/lib/whatsapp-format";

// Store configuration: shipping, settings, staff roles. Admins only (owners for roles);
// row-level security enforces the same rule in the database.

async function role(needed: AppRole) {
  try {
    return await requireRole(needed);
  } catch (e) {
    if (e instanceof AccessError) return null;
    throw e;
  }
}

const money = z.number().int().min(0).max(100_000_000);

// --- Shipping -----------------------------------------------------------------------------

const zoneSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(80),
  states: z.array(z.string().trim().max(60)).max(40),
  postal_prefixes: z.array(z.string().trim().regex(/^[0-9A-Za-z]{1,10}$/, "PIN prefixes are digits only, e.g. 560 or 4000.")).max(500),
  priority: z.number().int().min(-100).max(100),
  cod_available: z.boolean(),
  is_active: z.boolean(),
});

export async function saveZone(input: z.input<typeof zoneSchema>): Promise<ActionResult<{ id: string }>> {
  const ctx = await role("admin");
  if (!ctx) return fail("Only admins can change shipping.");
  const parsed = zoneSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the zone.");
  const { id, ...row } = parsed.data;
  const res = id
    ? await ctx.supabase.from("shipping_zones").update(row).eq("id", id).select("id").single()
    : await ctx.supabase.from("shipping_zones").insert({ ...row, countries: ["IN"] }).select("id").single();
  if (res.error) return fail(friendlyError(res.error));
  revalidatePath("/admin/shipping");
  return ok({ id: res.data.id }, "Zone saved.");
}

const rateSchema = z
  .object({
    id: z.string().uuid().nullable().optional(),
    zone_id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    description: z.string().max(200).default(""),
    price: money,
    free_over: money.nullable(),
    min_days: z.number().int().min(0).max(60),
    max_days: z.number().int().min(0).max(90),
    cod_available: z.boolean(),
    sort_order: z.number().int(),
    is_active: z.boolean(),
  })
  .refine((r) => r.max_days >= r.min_days, { message: "The slowest delivery time can't be shorter than the fastest." });

export async function saveRate(input: z.input<typeof rateSchema>): Promise<ActionResult<{ id: string }>> {
  const ctx = await role("admin");
  if (!ctx) return fail("Only admins can change shipping.");
  const parsed = rateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the rate.");
  const { id, ...row } = parsed.data;
  const res = id
    ? await ctx.supabase.from("shipping_rates").update(row).eq("id", id).select("id").single()
    : await ctx.supabase.from("shipping_rates").insert(row).select("id").single();
  if (res.error) return fail(friendlyError(res.error));
  revalidatePath("/admin/shipping");
  return ok({ id: res.data.id }, "Rate saved.");
}

export async function deleteShippingRow(table: "shipping_zones" | "shipping_rates" | "shipping_providers", id: string): Promise<ActionResult<null>> {
  const ctx = await role("admin");
  if (!ctx) return fail("Only admins can change shipping.");
  if (!["shipping_zones", "shipping_rates", "shipping_providers"].includes(table)) return fail("Unknown item.");
  const { error } = await ctx.supabase.from(table).delete().eq("id", id);
  if (error) return fail(error.code === "23503" ? "Past orders use it. Switch it off instead." : friendlyError(error));
  revalidatePath("/admin/shipping");
  return ok(null, "Deleted.");
}

export async function savePostalRule(input: { postal_code: string; blocks: "all" | "cod"; note: string }): Promise<ActionResult<null>> {
  const ctx = await role("admin");
  if (!ctx) return fail("Only admins can change shipping.");
  const code = input.postal_code.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9-]{3,10}$/.test(code)) return fail("Enter a valid PIN code.");
  const { error } = await ctx.supabase.from("postal_code_rules").upsert({ postal_code: code, blocks: input.blocks === "cod" ? "cod" : "all", note: input.note.slice(0, 200) });
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin/shipping");
  return ok(null, "Saved.");
}

export async function deletePostalRule(code: string): Promise<ActionResult<null>> {
  const ctx = await role("admin");
  if (!ctx) return fail("Only admins can change shipping.");
  const { error } = await ctx.supabase.from("postal_code_rules").delete().eq("postal_code", code);
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin/shipping");
  return ok(null, "Removed.");
}

export async function saveProvider(input: { id?: string | null; name: string; tracking_url_template: string; is_active: boolean }): Promise<ActionResult<null>> {
  const ctx = await role("admin");
  if (!ctx) return fail("Only admins can change shipping.");
  const name = input.name.trim().slice(0, 80);
  const template = input.tracking_url_template.trim();
  if (!name) return fail("Enter the courier's name.");
  if (template && (!template.startsWith("https://") || !template.includes("{tracking}"))) return fail("The tracking link must start with https:// and contain {tracking}.");
  const row = { name, tracking_url_template: template, is_active: input.is_active };
  const { error } = input.id ? await ctx.supabase.from("shipping_providers").update(row).eq("id", input.id) : await ctx.supabase.from("shipping_providers").insert(row);
  if (error) return fail(error.code === "23505" ? "A courier with that name already exists." : friendlyError(error));
  revalidatePath("/admin/shipping");
  return ok(null, "Courier saved.");
}

// --- Settings -----------------------------------------------------------------------------

const url = z.string().trim().max(1000).nullable().transform((v) => v || null);
const text = (max: number) => z.string().max(max);
/** Button links: a page on this site or an http(s) address, never javascript: or data:. */
const link = z.string().trim().max(300).refine((v) => v === "" || /^\/(?!\/)/.test(v) || /^https?:\/\/\S+$/i.test(v), "Links must be a page on this site (starting with /) or start with https://");
const webUrl = z.string().trim().max(300).refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Use a full address starting with https://");
/** A banner's film: a file uploaded to the store's storage, or an https address. */
const videoLink = z.string().trim().max(1000).refine((v) => v === "" || /^https:\/\/\S+$/i.test(v) || v.startsWith(storageUrl("")), "Video links must start with https://");

const SECTIONS = {
  general: z.object({
    store_name: z.string().trim().min(1).max(80),
    tagline: text(160),
    store_type: z.enum(STORE_TYPES).optional(),
    logo_url: url,
    contact: z.object({ email: text(200), phone: text(40), whatsapp: text(40), chat_button: z.boolean(), address: text(500), hours: text(200) }).partial(),
    social: z.object({ instagram: webUrl, facebook: webUrl, x: webUrl, pinterest: webUrl, youtube: webUrl }).partial(),
  }),
  // The whole look (design, mixed-in parts, colours, fonts), saved as its columns.
  appearance: lookSchema.transform(lookColumns),
  homepage: z.object({
    homepage: z.object({
      announcement: text(200).optional(),
      hero: z.array(z.object({
        image_url: z.string().max(1000), image_alt: text(200).optional(), eyebrow: text(80).optional(), heading: z.string().trim().min(1).max(120),
        subheading: text(300).optional(), cta_label: text(40).optional(), cta_href: link.optional(), secondary_label: text(40).optional(),
        secondary_href: link.optional(), video_url: videoLink.optional(), sample: z.boolean().optional(),
      })).max(6),
      promos: z.array(z.object({
        image_url: z.string().max(1000), image_alt: text(200).optional(), eyebrow: text(80).optional(), heading: z.string().trim().min(1).max(120),
        cta_label: text(40).optional(), cta_href: link.optional(), sample: z.boolean().optional(),
      })).max(6),
      sections: z.array(z.object({ key: z.enum(SECTION_KEYS), on: z.boolean() })).max(SECTION_KEYS.length).optional(),
    }),
  }),
  checkout: z.object({
    currency: z.literal("INR"),
    tax_mode: z.enum(["inclusive", "exclusive", "none"]),
    tax_label: z.string().trim().min(1).max(20),
    tax_slabs: z.array(z.object({ up_to: money.nullable(), rate_bps: z.number().int().min(0).max(5000) })).min(1).max(6),
    gstin: z.string().trim().max(20).regex(/^$|^[0-9A-Z]{15}$/, "A GSTIN has 15 letters and numbers."),
    free_shipping_threshold: money.nullable(),
    low_stock_threshold: z.number().int().min(0).max(10000),
    reservation_minutes: z.number().int().min(10).max(180),
    razorpay_enabled: z.boolean(),
    stripe_enabled: z.boolean(),
    cod_enabled: z.boolean(),
    cod_fee: money,
    cod_min_order: money,
    cod_max_order: money,
    cod_confirmation: z.boolean(),
    cod_confirm_hours: z.number().int().min(1, "Allow at least an hour to confirm.").max(168, "Allow at most a week to confirm."),
    cod_max_open_orders: z.number().int().min(1).max(20).nullable(),
    cod_max_returned: z.number().int().min(1).max(20).nullable(),
    return_window_days: z.number().int().min(0).max(365),
    return_shipping: z.enum(["free", "customer_pays", "deducted"]),
    return_shipping_fee: money,
    reviews_enabled: z.boolean(),
    reviews_require_purchase: z.boolean(),
    reviews_auto_publish: z.boolean(),
  }),
  content: z.object({
    policies: z.object({ shipping: text(20000), returns: text(20000), privacy: text(20000), terms: text(20000), about: text(20000) }).partial(),
    faq: z.array(z.object({ q: z.string().trim().min(1).max(300), a: z.string().trim().min(1).max(3000) })).max(50),
  }),
  seo: z.object({ seo_title: text(120), seo_description: text(320), og_image_url: url }),
  emails: z.object({
    email_templates: z.record(z.string().regex(/^[a-z_]{3,40}$/), z.object({ subject: z.string().max(200), body: z.string().max(5000) })),
  }),
  maintenance: z.object({ maintenance_mode: z.boolean(), maintenance_message: text(500) }),
  whatsapp: z.object({
    whatsapp_enabled: z.boolean(),
    whatsapp_templates: z.partialRecord(
      z.enum(WHATSAPP_EVENTS.map((e) => e.key) as [WhatsAppEvent, ...WhatsAppEvent[]]),
      z.object({
        name: z.string().trim().max(512).regex(/^$|^[a-z0-9_]+$/, "Template names use lowercase letters, numbers and underscores."),
        language: z.string().trim().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, "Use a language code like en, en_US or hi."),
      }),
    ),
  }),
  signin: z.object({
    phone_login_enabled: z.boolean(),
    phone_login_channel: z.enum(["sms", "whatsapp"]),
    whatsapp_login_template: z.string().trim().max(512).regex(/^$|^[a-z0-9_]+$/, "Template names use lowercase letters, numbers and underscores."),
    whatsapp_login_language: z.string().trim().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, "Use a language code such as en, en_US or hi."),
  }),
  reminders: z.object({
    stock_alerts_enabled: z.boolean(),
    cart_reminders_enabled: z.boolean(),
    cart_reminder_hours: z.number().int().min(1, "Wait at least an hour.").max(72, "Send the reminder within three days."),
    price_alerts_enabled: z.boolean(),
  }),
  courier: z.object({
    shiprocket_enabled: z.boolean(),
    shiprocket_pickup_location: z.string().trim().min(1, "Enter the pickup address name from Shiprocket.").max(80),
    shiprocket_pickup_postcode: z.string().trim().regex(/^$|^[1-9][0-9]{5}$/, "Enter the pickup address's 6-digit PIN code."),
    shiprocket_courier_choice: z.enum(["recommended", "cheapest", "fastest"]),
    package_defaults: z.object({
      length_cm: z.number().min(1).max(300),
      breadth_cm: z.number().min(1).max(300),
      height_cm: z.number().min(1).max(300),
      item_weight_grams: z.number().int().min(10).max(50_000),
    }),
  }),
} as const;

export type SettingsSection = keyof typeof SECTIONS;

/** Sections for the platform's own accounts (Shiprocket, WhatsApp, text messages): the home store's only, for now. */
const HOME_ONLY: SettingsSection[] = ["courier", "whatsapp", "signin"];

export async function saveSettings(section: SettingsSection, values: unknown): Promise<ActionResult<null>> {
  const ctx = await role("admin");
  if (!ctx) return fail("Only admins can change settings.");
  const schema = SECTIONS[section];
  if (!schema) return fail("Unknown settings section.");
  if (HOME_ONLY.includes(section) && !ctx.store.isHome) return fail("This uses the platform's own accounts, so for now only the main store can set it up.");
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(`${issue?.path.join(" › ") ? `${issue.path.join(" › ")}: ` : ""}${issue?.message ?? "Check the form."}`);
  }
  const data = parsed.data as Record<string, unknown>;
  if (section === "courier" && data.shiprocket_enabled && !data.shiprocket_pickup_postcode) {
    return fail("Add the pickup PIN code to turn on Shiprocket.");
  }
  if (section === "signin" && data.phone_login_enabled) {
    const problem = await phoneSignInProblem(data as { phone_login_channel: string; whatsapp_login_template: string });
    if (problem) return fail(problem);
  }
  if (section === "checkout") {
    const slabs = (data.tax_slabs as { up_to: number | null }[]) ?? [];
    if (slabs[slabs.length - 1]?.up_to !== null) return fail("The last tax slab must have no upper limit.");
    if (Number(data.cod_max_order) < Number(data.cod_min_order)) return fail("The cash on delivery maximum must be above the minimum.");
  }
  const update = ctx.supabase.from("store_settings").update(data as never);
  const { error } = await (ctx.store.id ? update.eq("store_id", ctx.store.id) : update.eq("id", 1));
  if (error) return fail(friendlyError(error, "Settings couldn't be saved."));
  revalidateTag("settings");
  // The store lookup carries the maintenance switch.
  revalidateTag("stores");
  revalidatePath("/", "layout");
  return ok(null, "Settings saved.");
}

/**
 * A link that opens the store in an unsaved look ("Preview on the store"): signed, for this
 * store only, for two hours. Opening it changes nothing for anyone else.
 */
export async function previewLook(input: unknown): Promise<ActionResult<{ url: string }>> {
  const ctx = await role("admin");
  if (!ctx) return fail("Only admins can preview looks.");
  const parsed = lookSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the colours and fonts.");
  if (!ctx.store.isHome && !ctx.store.host) return fail("Give the store a web address first (All stores › the store › Web addresses).");
  return ok({ url: `${storeOrigin(ctx.store)}/?look=${signLookPreview(ctx.store.id, parsed.data)}` });
}

/** What still stops customers from signing in with a mobile number, if anything. */
async function phoneSignInProblem(s: { phone_login_channel: string; whatsapp_login_template: string }) {
  if (!SMS_HOOK_SECRET) return "Connect the Send SMS hook first: set SUPABASE_SMS_HOOK_SECRET on the server (README › Mobile sign-in).";
  if (s.phone_login_channel === "whatsapp") {
    if (!whatsappConnected()) return "Connect WhatsApp first (WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID), or send codes by SMS.";
    if (!s.whatsapp_login_template) return "Enter the name of your approved WhatsApp authentication template.";
  } else if (!msg91Configured()) {
    return "Connect MSG91 first: set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID on the server, or send codes on WhatsApp.";
  }
  const auth = await authProviderStatus(true);
  if (!auth) return "Couldn't read Supabase's sign-in settings. Try again in a minute.";
  if (!auth.phone) return "Turn on the Phone provider in Supabase first (Authentication › Sign In / Providers › Phone).";
  if (!auth.confirmations) return "Turn on phone confirmations in Supabase first (Authentication › Sign In / Providers › Phone › Confirm phone).";
  return null;
}

export async function deleteSampleData(): Promise<ActionResult<{ deleted: number; archived: number }>> {
  const ctx = await role("admin");
  if (!ctx) return fail("Only admins can do this.");
  const { data, error } = await ctx.supabase.rpc("admin_delete_sample_data");
  if (error) return fail(friendlyError(error));
  revalidateTag("catalog");
  revalidateTag("settings");
  revalidatePath("/", "layout");
  const r = data as { deleted: number; archived: number; other_rows: number };
  return ok({ deleted: r.deleted, archived: r.archived }, `Removed ${r.deleted} sample products${r.archived ? ` (${r.archived} with orders were archived)` : ""} and ${r.other_rows} other sample records.`);
}

// --- Staff --------------------------------------------------------------------------------

export async function grantStaffRole(email: string, newRole: AppRole): Promise<ActionResult<null>> {
  const ctx = await role("owner");
  if (!ctx) return fail("Only owners can manage staff.");
  if (!z.string().email().safeParse(email.trim()).success) return fail("Enter the person's email address.");
  if (!["owner", "admin", "staff"].includes(newRole)) return fail("Choose a role.");
  const { error } = await ctx.supabase.rpc("grant_role", { p_email: email.trim(), p_role: newRole });
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin/staff");
  return ok(null, `${email.trim()} is now ${newRole === "admin" ? "an admin" : newRole === "owner" ? "an owner" : "staff"}.`);
}

export async function revokeStaffRole(userId: string): Promise<ActionResult<null>> {
  const ctx = await role("owner");
  if (!ctx) return fail("Only owners can manage staff.");
  if (userId === ctx.user.id) return fail("You can't remove your own access. Ask another owner.");
  const { error } = await ctx.supabase.rpc("revoke_role", { p_user_id: userId });
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin/staff");
  return ok(null, "Access removed. They keep their customer account.");
}
