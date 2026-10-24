import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { z } from "zod";
import { BUTTON_STYLES, CARD_STYLES, CORNER_STYLES, DESIGN_KEYS, HEADER_STYLES, HERO_STYLES, lookOfSettings, resolveDesign, type Look, type TakenLook } from "./designs";
import { LINK_SECRET } from "./server-env";
import type { Settings } from "./settings";
import { contextStoreId } from "./store";
import { supabaseService } from "./supabase/admin";
import { BODY_FONT_KEYS, HEADING_FONT_KEYS, HEADING_FONTS, themeOf } from "./theme";

// A store's look as the storefront shows it: what's saved in Settings › Appearance, or a
// look the admin is trying out ("Preview on the store"), carried in a signed cookie so only
// the admin can start one, for that store, for two hours.

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colours are hex codes like #1a1a1a.");

export const designOptionsSchema = z
  .object({
    header: z.enum(HEADER_STYLES),
    hero: z.enum(HERO_STYLES),
    card: z.enum(CARD_STYLES),
    corners: z.enum(CORNER_STYLES),
    buttons: z.enum(BUTTON_STYLES),
  })
  .partial()
  .strict();

export const lookSchema = z.object({
  design: z.enum(DESIGN_KEYS),
  colors: z.object({ text: hex, brand: hex, accent: hex, background: hex }),
  heading_font: z.enum(HEADING_FONT_KEYS),
  body_font: z.enum(BODY_FONT_KEYS),
  heading_italic: z.boolean(),
  options: designOptionsSchema,
});

/** Settings › Appearance's columns for a look. */
export function lookColumns(l: Look) {
  return {
    design: l.design,
    design_options: { ...l.options } as Record<string, string>,
    primary_color: l.colors.text,
    brand_color: l.colors.brand,
    accent_color: l.colors.accent,
    background_color: l.colors.background,
    heading_font: l.heading_font,
    body_font: l.body_font,
    // A face without a true italic is always set upright.
    heading_italic: l.heading_italic && HEADING_FONTS[l.heading_font].italic,
  };
}

export const LOOK_COOKIE = "taana_look";
const PREVIEW_SECONDS = 2 * 60 * 60;

function sign(payload: string) {
  if (!LINK_SECRET) throw new Error("ORDER_LINK_SECRET (or SUPABASE_SERVICE_ROLE_KEY) is not set.");
  return createHmac("sha256", LINK_SECRET).update(`look:${payload}`).digest("base64url").slice(0, 32);
}

/** A token that shows `storeId`'s storefront in `look`, for two hours, to whoever opens it. */
export function signLookPreview(storeId: string | null, look: Look) {
  const payload = Buffer.from(JSON.stringify({ s: storeId ?? "", l: look, e: Math.floor(Date.now() / 1000) + PREVIEW_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The look in a preview token, if it's genuine, unexpired and for this store. */
export function readLookPreview(token: string | undefined, storeId: string | null): Look | null {
  if (!token || !LINK_SECRET) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { s?: string; l?: unknown; e?: number };
    if (typeof data.e !== "number" || data.e < Date.now() / 1000) return null;
    if ((data.s || null) !== storeId) return null;
    const look = lookSchema.safeParse(data.l);
    return look.success ? look.data : null;
  } catch {
    return null;
  }
}

/** The look this storefront request shows, and whether it's an unsaved preview. */
export const storefrontLook = cache(async (settings: Settings) => {
  const { colors, italic } = themeOf(settings);
  const saved = lookOfSettings(settings, colors, italic);
  const preview = readLookPreview((await cookies()).get(LOOK_COOKIE)?.value, await contextStoreId());
  const look = preview ?? saved;
  return { look, design: resolveDesign(look.design, look.options), preview: !!preview };
});

/** Every other store's look, so a new or refreshed look can differ from all of them. */
export async function takenLooks(exceptStoreId?: string | null): Promise<TakenLook[]> {
  try {
    const { data, error } = await supabaseService().from("store_settings").select("store_id, design, brand_color, background_color, heading_font");
    if (error || !data) return [];
    return data
      .filter((r) => !exceptStoreId || r.store_id !== exceptStoreId)
      .map((r) => ({ design: r.design, brand: r.brand_color, background: r.background_color, heading_font: r.heading_font }));
  } catch {
    return [];
  }
}
