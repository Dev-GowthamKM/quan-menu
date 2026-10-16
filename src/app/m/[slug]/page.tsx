import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import MenuView from "@/components/MenuView";
import DemoMenu from "@/components/DemoMenu";
import { DEMO } from "@/lib/config";
import { EXAMPLE_MENU } from "@/lib/demo";
import { EXAMPLE_CAFE } from "@/lib/demo-cafe";
import { liveRates } from "@/lib/rates";
import { supabasePublic } from "@/lib/supabase/public";
import { cleanDish, cleanKind, cleanToppings, type Dish, type MenuData } from "@/lib/types";

type Params = { params: Promise<{ slug: string }> };

/** Shared by the page and its metadata, so each render queries the database once. */
const load = cache(async (slug: string): Promise<MenuData | null> => {
  if (slug === "demo") return EXAMPLE_MENU;
  if (slug === "demo-cafe") return EXAMPLE_CAFE;
  if (DEMO) return null;
  const supabase = supabasePublic();
  const { data: stall } = await supabase
    .from("stalls")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!stall) return null;
  const { data: rows } = await supabase.from("dishes").select("*").eq("stall_id", stall.id).order("position");
  return {
    name: stall.name,
    area: stall.area,
    slug: stall.slug,
    published: true,
    dishes: (rows ?? []).map(cleanDish).filter((d): d is Dish => !!d),
    kind: cleanKind(stall.kind),
    toppings: cleanToppings(stall.toppings),
  };
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const m = await load(slug);
  return { title: m ? `${m.name} — Menu` : "Menu — Quán" };
}

// Every QR scan lands here, so menus are cached and rebuilt at most once a minute.
// Saving in the editor refreshes a stall's page straight away (revalidatePath in actions.ts).
export const revalidate = 60;
export async function generateStaticParams() {
  return [];
}

export default async function PublicMenu({ params }: Params) {
  const { slug } = await params;
  const menu = await load(slug);
  if (!menu) {
    if (DEMO) return <DemoMenu slug={slug} />;
    notFound();
  }
  const rates = await liveRates();
  const demoSlug = slug === "demo" || slug === "demo-cafe";
  return <MenuView full name={menu.name} area={menu.area} dishes={menu.dishes} toppings={menu.toppings} rates={rates} countSlug={demoSlug ? undefined : menu.slug} />;
}
