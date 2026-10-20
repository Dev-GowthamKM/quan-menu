"use server";
import { revalidatePath } from "next/cache";
import { DEMO, slugify } from "@/lib/config";
import { serverT } from "@/lib/server-ui";
import type { Strings } from "@/lib/strings";
import { supabaseServer } from "@/lib/supabase/server";
import {
  cleanDish, cleanKind, cleanMaps, cleanPay, cleanSoldOut, cleanToppings,
  type Dish, type Pay, type ShopKind, type SoldOut, type Topping,
} from "@/lib/types";

export interface SaveResult {
  ok: boolean;
  error?: string;
  /** The menu changed elsewhere since the editor loaded it: offer a reload. */
  stale?: boolean;
  slug?: string;
  id?: string;
  updatedAt?: string;
}

/** Turns database errors into messages a vendor can act on. */
function dbError(t: Strings, error: { code?: string; message?: string }, slug = ""): SaveResult {
  if (error.code === "23505") return { ok: false, error: t.srvSlugTaken(slug) };
  if (error.code === "PT409") return { ok: false, stale: true, error: t.srvStale };
  if (error.code === "PT404") return { ok: false, error: t.srvStallGone };
  // A function or column this version needs is missing: supabase/schema.sql hasn't been re-run.
  if (error.code === "PGRST202" || error.code === "PGRST204" || error.code === "42883" || error.code === "42703") {
    return { ok: false, error: t.srvSchemaOld };
  }
  console.error("[db]", error.code, error.message);
  return { ok: false, error: t.saveFailed };
}

const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

export async function saveMenu(input: {
  /** The stall to save; empty creates a new one. */
  id?: string | null;
  /** The stall's updatedAt when the editor loaded it. */
  expect?: string | null;
  /** The address before this save, so its cached page is refreshed too. */
  prevSlug?: string;
  name: string;
  area: string;
  slug: string;
  published: boolean;
  dishes: Dish[];
  kind?: ShopKind;
  toppings?: Topping[];
  pay?: Pay | null;
  maps?: string;
}): Promise<SaveResult> {
  const t = await serverT();
  if (DEMO) return { ok: false, error: t.srvDemoSave };

  const name = String(input.name || "").trim().slice(0, 120);
  if (!name) return { ok: false, error: t.srvNeedName };
  const slug = slugify(input.slug || name);
  if (slug.length < 3) return { ok: false, error: t.srvShortSlug };
  // These addresses always show the sample menus, so a real stall can't use them.
  if (slug === "demo" || slug === "demo-cafe") return { ok: false, error: t.srvSlugTaken(slug) };
  const dishes = (Array.isArray(input.dishes) ? input.dishes : [])
    .slice(0, 200)
    .map(cleanDish)
    .filter((d): d is Dish => !!d);

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: t.loginExpired };

  const { data, error } = await supabase.rpc("save_menu", {
    p_stall: uuid(input.id),
    p_expect: typeof input.expect === "string" && input.expect ? input.expect : null,
    p_name: name,
    p_area: String(input.area || "").trim().slice(0, 160),
    p_slug: slug,
    p_published: !!input.published,
    p_kind: cleanKind(input.kind),
    p_toppings: cleanToppings(input.toppings),
    p_pay: cleanPay(input.pay),
    p_maps: cleanMaps(input.maps),
    p_dishes: dishes,
  });
  if (error) return dbError(t, error, slug);
  const row = data as { id: string; slug: string; updated_at: string };
  revalidatePath(`/m/${row.slug}`);
  if (input.prevSlug && slugify(input.prevSlug) !== row.slug) revalidatePath(`/m/${slugify(input.prevSlug)}`);
  return { ok: true, slug: row.slug, id: row.id, updatedAt: row.updated_at };
}

/** Marks a dish sold out for today, or back on. Takes effect at once, without saving the menu. */
export async function setSoldOut(stallId: string, slug: string, vi: string, on: boolean): Promise<{ ok: boolean; soldOut?: SoldOut; error?: string }> {
  const t = await serverT();
  if (DEMO || !uuid(stallId)) return { ok: false, error: t.soldOutFailed };
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("set_sold_out", { p_stall: stallId, p_vi: String(vi).slice(0, 200), p_on: !!on });
  if (error) return { ok: false, error: dbError(t, error).error };
  revalidatePath(`/m/${slugify(slug)}`);
  return { ok: true, soldOut: cleanSoldOut(data) };
}

/** Makes a new owner link for a stall (replacing any old one) and returns its token. */
export async function makeOwnerKey(stallId: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  const t = await serverT();
  if (DEMO || !uuid(stallId)) return { ok: false, error: t.ownerFailed };
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("new_owner_key", { p_stall: stallId });
  if (error || typeof data !== "string") return { ok: false, error: error ? dbError(t, error).error : t.ownerFailed };
  return { ok: true, token: data };
}

export async function removeOwnerKey(stallId: string): Promise<{ ok: boolean }> {
  if (DEMO || !uuid(stallId)) return { ok: false };
  const supabase = await supabaseServer();
  const { error } = await supabase.from("stall_keys").delete().eq("stall_id", stallId);
  return { ok: !error };
}

/** Deletes a stall with its dishes, view counts and owner link. The editor removes its photos. */
export async function deleteStall(stallId: string, slug: string): Promise<{ ok: boolean; error?: string }> {
  const t = await serverT();
  if (DEMO || !uuid(stallId)) return { ok: false, error: t.deleteFailed };
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: t.loginExpired };
  const { data, error } = await supabase.from("stalls").delete().eq("id", stallId).eq("owner_id", auth.user.id).select("id");
  if (error || !data?.length) return { ok: false, error: t.deleteFailed };
  revalidatePath(`/m/${slugify(slug)}`);
  return { ok: true };
}

export async function signOut() {
  if (DEMO) return;
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
}
