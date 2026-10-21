import { redirect } from "next/navigation";
import Editor from "@/components/Editor";
import { UiProvider } from "@/components/Ui";
import { liveRates } from "@/lib/rates";
import { uiLang } from "@/lib/server-ui";
import { DEMO, SCHEMA_VERSION, SITE_URL } from "@/lib/config";
import { supabaseServer } from "@/lib/supabase/server";
import {
  cleanDish, cleanKind, cleanMaps, cleanPay, cleanSoldOut, cleanToppings, vnToday,
  type Dish, type MenuData, type StallRef,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thực đơn của bạn · Quán" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Dashboard({ searchParams }: Search) {
  // Mirrors requireVendor(): without logins, AI only runs in local development.
  const ai = !!process.env.ANTHROPIC_API_KEY && (!DEMO || process.env.NODE_ENV !== "production");
  const [lang, rates] = await Promise.all([uiLang(), liveRates()]);
  if (DEMO) return <UiProvider lang={lang}><Editor initial={null} demo ai={ai} siteUrl={SITE_URL} rates={rates} /></UiProvider>;

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  // One account can run several stalls: ?s=<address> opens one, ?new=1 starts another.
  const sp = await searchParams;
  const want = typeof sp.s === "string" ? sp.s : "";
  const [{ data: list, error: listError }, version] = await Promise.all([
    supabase.from("stalls").select("id, slug, name, published, updated_at").eq("owner_id", auth.user.id).order("updated_at", { ascending: false }),
    supabase.rpc("schema_version"),
  ]);
  // Never show an empty editor because the database didn't answer: saving it would replace the real menu.
  if (listError) throw new Error(`Stalls could not be loaded: ${listError.message}`);
  const rows = list ?? [];
  const pick = sp.new === "1" ? undefined : rows.find((r) => r.slug === want) ?? rows[0];
  const stalls: StallRef[] = rows
    .map((r) => ({ id: r.id, slug: r.slug, name: r.name, published: r.published }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  // Only a database that answers with an old version (or without the function) is out of date; a timeout isn't.
  const schemaOld = version.error ? version.error.code === "PGRST202" : Number(version.data) < SCHEMA_VERSION;

  let initial: MenuData | null = null;
  let views: { today: number; week: number } | undefined;
  let ownerKey: string | null = null;
  if (pick) {
    // Views from the last 7 days (Vietnam time), for the counter in the editor.
    const today = vnToday();
    const since = new Date(Date.parse(today) - 6 * 86400_000).toISOString().slice(0, 10);
    const [{ data: stall, error: stallError }, { data: dishRows, error: dishError }, { data: vrows }, { data: key }] = await Promise.all([
      supabase.from("stalls").select("*").eq("id", pick.id).single(),
      supabase.from("dishes").select("*").eq("stall_id", pick.id).order("position"),
      supabase.from("menu_views").select("day, views").eq("stall_id", pick.id).gte("day", since),
      supabase.from("stall_keys").select("token").eq("stall_id", pick.id).maybeSingle(),
    ]);
    if (stallError || dishError) throw new Error(`Stall ${pick.slug} could not be loaded: ${(stallError ?? dishError)!.message}`);
    if (vrows) {
      views = {
        today: vrows.filter((r) => r.day === today).reduce((a, r) => a + r.views, 0),
        week: vrows.reduce((a, r) => a + r.views, 0),
      };
    }
    ownerKey = typeof key?.token === "string" ? key.token : null;
    if (stall) {
      initial = {
        id: stall.id,
        updatedAt: stall.updated_at,
        name: stall.name,
        area: stall.area,
        slug: stall.slug,
        published: stall.published,
        dishes: (dishRows ?? []).map(cleanDish).filter((d): d is Dish => !!d),
        kind: cleanKind(stall.kind),
        toppings: cleanToppings(stall.toppings),
        pay: cleanPay(stall.pay),
        maps: cleanMaps(stall.maps),
        soldOut: cleanSoldOut(stall.sold_out),
      };
    }
  }

  return (
    <UiProvider lang={lang}>
      <Editor key={initial?.id ?? "new"} initial={initial} demo={false} ai={ai} siteUrl={SITE_URL} email={auth.user.email ?? ""}
        rates={rates} views={views} stalls={stalls} ownerKey={ownerKey} schemaOld={schemaOld} />
    </UiProvider>
  );
}
