"use server";
import { revalidatePath } from "next/cache";
import { slugify } from "@/lib/config";
import { supabasePublic } from "@/lib/supabase/public";
import { SIZE_KEYS, cleanSoldOut, soldToday, type SizeKey } from "@/lib/types";

/**
 * Actions for the owner page. They need no login: the secret token from the link is checked by
 * the database (quick_* functions in supabase/schema.sql), which only lets it touch its own stall.
 * The slug is only used to refresh the customer page's cache.
 */
const okToken = (t: unknown): t is string => typeof t === "string" && /^[0-9a-f]{32}$/.test(t);
const okId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const money = (v: unknown) => Math.max(0, Math.min(100_000_000, Math.round(Number(v) || 0)));

export async function quickSoldOut(token: string, slug: string, vi: string, on: boolean): Promise<{ ok: boolean; names?: string[] }> {
  if (!okToken(token)) return { ok: false };
  const { data, error } = await supabasePublic().rpc("quick_sold_out", { p_token: token, p_vi: String(vi).slice(0, 200), p_on: !!on });
  if (error || !data) return { ok: false };
  revalidatePath(`/m/${slugify(slug)}`);
  return { ok: true, names: soldToday(cleanSoldOut(data)) };
}

/** `gone` means the dish no longer exists (the menu was saved in the editor meanwhile): reload the page. */
export async function quickPrice(
  token: string, slug: string, dish: string, price: number, sizes?: Partial<Record<SizeKey, number>>,
): Promise<{ ok: boolean; gone?: boolean }> {
  if (!okToken(token) || !okId(dish)) return { ok: false };
  const z = sizes
    ? Object.fromEntries(Object.entries(sizes).filter(([k]) => SIZE_KEYS.includes(k as SizeKey)).map(([k, v]) => [k, money(v)]))
    : null;
  const { data, error } = await supabasePublic().rpc("quick_price", { p_token: token, p_dish: dish, p_price: money(price), p_sizes: z });
  if (error) {
    console.error("[quick] price", error.code, error.message);
    return { ok: false };
  }
  if (!data) return { ok: false, gone: true };
  revalidatePath(`/m/${slugify(slug)}`);
  return { ok: true };
}
