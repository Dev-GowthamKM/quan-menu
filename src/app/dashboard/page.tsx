import { redirect } from "next/navigation";
import Editor from "@/components/Editor";
import { UiProvider } from "@/components/Ui";
import { liveRates } from "@/lib/rates";
import { uiLang } from "@/lib/server-ui";
import { DEMO, SITE_URL } from "@/lib/config";
import { supabaseServer } from "@/lib/supabase/server";
import { cleanDish, cleanKind, cleanToppings, type Dish, type MenuData } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thực đơn của bạn · Quán" };

export default async function Dashboard() {
  // Mirrors requireVendor(): without logins, AI only runs in local development.
  const ai = !!process.env.ANTHROPIC_API_KEY && (!DEMO || process.env.NODE_ENV !== "production");
  const [lang, rates] = await Promise.all([uiLang(), liveRates()]);
  if (DEMO) return <UiProvider lang={lang}><Editor initial={null} demo ai={ai} siteUrl={SITE_URL} rates={rates} /></UiProvider>;

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: stall } = await supabase
    .from("stalls")
    .select("*")
    .eq("owner_id", auth.user.id)
    .maybeSingle();

  let initial: MenuData | null = null;
  let views: { today: number; week: number } | undefined;
  if (stall) {
    // Views from the last 7 days (Vietnam time), for the counter in the editor.
    const vnToday = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const since = new Date(Date.parse(vnToday) - 6 * 86400_000).toISOString().slice(0, 10);
    const { data: vrows } = await supabase.from("menu_views").select("day, views").eq("stall_id", stall.id).gte("day", since);
    if (vrows) {
      views = {
        today: vrows.filter((r) => r.day === vnToday).reduce((a, r) => a + r.views, 0),
        week: vrows.reduce((a, r) => a + r.views, 0),
      };
    }
    const { data: rows } = await supabase.from("dishes").select("*").eq("stall_id", stall.id).order("position");
    initial = {
      name: stall.name,
      area: stall.area,
      slug: stall.slug,
      published: stall.published,
      dishes: (rows ?? []).map(cleanDish).filter((d): d is Dish => !!d),
      kind: cleanKind(stall.kind),
      toppings: cleanToppings(stall.toppings),
    };
  }

  return <UiProvider lang={lang}><Editor initial={initial} demo={false} ai={ai} siteUrl={SITE_URL} email={auth.user.email ?? ""} rates={rates} views={views} /></UiProvider>;
}
