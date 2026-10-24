"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { ADMIN_STORE_COOKIE, isPlatformAdmin, myStores } from "@/lib/store";
import { sessionClient } from "@/lib/supabase/session";
import { THEME_PRESETS } from "@/lib/theme";
import { addVercelDomain, removeVercelDomain, vercelDomainsReady } from "@/lib/vercel";

// The platform: switching the admin panel between stores, and (for the platform's admins)
// creating and running stores. The database functions check who may do what again, so
// these checks are for clear messages.

const uuid = z.string().uuid();

/** The admin panel works on this store from now on; it must be one the person works at. */
export async function switchStore(storeId: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(storeId).success) return fail("Unknown store.");
  const stores = await myStores();
  const store = stores.find((s) => s.id === storeId);
  if (!store) return fail("You don't work at that store.");
  (await cookies()).set(ADMIN_STORE_COOKIE, storeId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return ok(null, `Now working on ${store.name}.`);
}

async function platform() {
  if (!(await getUser()) || !(await isPlatformAdmin())) return null;
  // No store header: these functions work across stores and check the caller themselves.
  return sessionClient(null);
}

function changed(storeId?: string) {
  revalidateTag("stores");
  revalidatePath("/admin/stores");
  if (storeId) revalidatePath(`/admin/stores/${storeId}`);
}

const hostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
  .refine((v) => v === "" || /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{2,5})?$/.test(v), "Enter a web address like mystore.vercel.app or shop.example.com.");

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the store a name.").max(80),
  slug: z.string().trim().toLowerCase().max(40).regex(/^$|^[a-z0-9]+(-[a-z0-9]+)*$/, "The short name can use lowercase letters, numbers and single hyphens."),
  order_prefix: z.string().trim().toUpperCase().regex(/^$|^[A-Z]{2,4}$/, "Order numbers start with 2 to 4 capital letters, like TA."),
  hostname: hostSchema,
  owner_email: z.string().trim().max(254).refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter the owner's email address, or leave it empty."),
  theme: z.string().refine((k) => THEME_PRESETS.some((p) => p.key === k), "Choose a look."),
  tagline: z.string().trim().max(160).default(""),
  samples: z.boolean().default(false),
});

export type CreateStoreInput = z.input<typeof createSchema>;

/** Copies the home store's sample catalog into a store, as one database call. */
async function copySamples(sb: NonNullable<Awaited<ReturnType<typeof platform>>>, storeId: string) {
  const { data, error } = await sb.rpc("platform_add_samples", { p_store_id: storeId });
  if (error) return { ok: false as const, message: friendlyError(error, "The sample catalog couldn't be added.") };
  revalidateTag("catalog");
  revalidateTag("settings");
  const n = data as { products: number; collections: number; coupons: number };
  return { ok: true as const, message: `Added ${n.products} sample products, ${n.collections} collections and ${n.coupons} discount codes.` };
}

/**
 * Creates a store with its owner, look, starter policies, a delivery zone for India and the
 * usual couriers, and (if asked) a copy of the sample catalog.
 */
export async function createStore(input: CreateStoreInput): Promise<ActionResult<{ id: string; domain: string | null; samples: string | null }>> {
  const sb = await platform();
  if (!sb) return fail("Only the platform's administrators can create stores.");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const p = parsed.data;
  const preset = THEME_PRESETS.find((t) => t.key === p.theme)!;
  const { data, error } = await sb.rpc("platform_create_store", {
    p: {
      name: p.name,
      slug: p.slug,
      order_prefix: p.order_prefix,
      hostname: p.hostname,
      owner_email: p.owner_email,
      tagline: p.tagline,
      colors: { ...preset.colors },
      heading_font: preset.heading_font,
      body_font: preset.body_font,
      heading_italic: preset.heading_italic,
    },
  });
  if (error) return fail(friendlyError(error, "The store couldn't be created."));
  const id = data as string;
  // The store exists from here on: a problem with the extras is reported, not a failure.
  const samples = p.samples ? (await copySamples(sb, id)).message : null;
  let domain: string | null = null;
  if (p.hostname && vercelDomainsReady()) domain = (await addVercelDomain(p.hostname)).message;
  changed(id);
  return ok({ id, domain, samples }, `${p.name} is ready.`);
}

/** Gives a store the sample catalog, to try it out with products in place. */
export async function addSampleCatalog(storeId: string): Promise<ActionResult<null>> {
  const sb = await platform();
  if (!sb) return fail("Only the platform's administrators can do this.");
  if (!uuid.safeParse(storeId).success) return fail("Unknown store.");
  const res = await copySamples(sb, storeId);
  if (!res.ok) return fail(res.message);
  changed(storeId);
  return ok(null, res.message);
}

/** Renames a store, or suspends it (its storefront closes) and opens it again. */
export async function updateStore(storeId: string, input: { name?: string; status?: "active" | "suspended" }): Promise<ActionResult<null>> {
  const sb = await platform();
  if (!sb) return fail("Only the platform's administrators can change stores.");
  if (!uuid.safeParse(storeId).success) return fail("Unknown store.");
  const name = input.name?.trim();
  if (name !== undefined && (name.length < 1 || name.length > 80)) return fail("Give the store a name of up to 80 characters.");
  const { error } = await sb.rpc("platform_update_store", { p_store_id: storeId, p: { ...(name ? { name } : {}), ...(input.status ? { status: input.status } : {}) } });
  if (error) return fail(friendlyError(error));
  changed(storeId);
  return ok(null, input.status === "suspended" ? "The store is suspended. Its site shows a closed page." : input.status === "active" ? "The store is open again." : "Saved.");
}

/** Adds a web address to a store (and to Vercel, when it's connected). */
export async function addStoreDomain(storeId: string, hostname: string, primary: boolean): Promise<ActionResult<{ vercel: string | null }>> {
  const sb = await platform();
  if (!sb) return fail("Only the platform's administrators can change web addresses.");
  if (!uuid.safeParse(storeId).success) return fail("Unknown store.");
  const host = hostSchema.safeParse(hostname);
  if (!host.success || !host.data) return fail(host.success ? "Enter a web address." : host.error.issues[0]?.message ?? "Check the address.");
  const { error } = await sb.rpc("platform_add_domain", { p_store_id: storeId, p_hostname: host.data, p_primary: primary });
  if (error) return fail(friendlyError(error));
  const vercel = vercelDomainsReady() ? (await addVercelDomain(host.data)).message : null;
  changed(storeId);
  return ok({ vercel }, `${host.data} now opens this store.`);
}

/** Removes a web address from its store (and from Vercel, when it's connected). */
export async function removeStoreDomain(storeId: string, hostname: string): Promise<ActionResult<null>> {
  const sb = await platform();
  if (!sb) return fail("Only the platform's administrators can change web addresses.");
  const { error } = await sb.rpc("platform_remove_domain", { p_hostname: hostname });
  if (error) return fail(friendlyError(error));
  await removeVercelDomain(hostname);
  changed(storeId);
  return ok(null, `${hostname} no longer opens this store.`);
}

/** Lets someone else run the platform too (they need an account first). */
export async function grantPlatformAdmin(email: string): Promise<ActionResult<null>> {
  const sb = await platform();
  if (!sb) return fail("Only the platform's administrators can do this.");
  if (!z.string().email().safeParse(email.trim()).success) return fail("Enter their email address.");
  const { error } = await sb.rpc("platform_grant_admin", { p_email: email.trim() });
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin/stores");
  return ok(null, `${email.trim()} can now create and run stores.`);
}

/** Takes away someone's platform access (never your own). */
export async function revokePlatformAdmin(userId: string): Promise<ActionResult<null>> {
  const sb = await platform();
  if (!sb) return fail("Only the platform's administrators can do this.");
  if (!uuid.safeParse(userId).success) return fail("Unknown person.");
  const { error } = await sb.rpc("platform_revoke_admin", { p_user_id: userId });
  if (error) return fail(friendlyError(error));
  revalidatePath("/admin/stores");
  return ok(null, "Platform access removed. They keep their roles in each store.");
}
